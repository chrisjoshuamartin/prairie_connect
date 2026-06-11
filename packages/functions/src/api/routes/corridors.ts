import { createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { sql, eq } from "drizzle-orm";
import { getDb } from "@prairie-connect/core/db/client";
import { corridors, railLines, railEdges, railNodes } from "@prairie-connect/core/db/schema/index";
import { slugify } from "@prairie-connect/core/rail/import";
import { requireRole } from "../middleware/auth";
import {
  CorridorSchema,
  CorridorDetailSchema,
  CreateCorridorSchema,
  UpdateCorridorSchema,
} from "../schemas";
import {
  createRouter,
  jsonOf,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  bearerSecurity,
} from "../openapi";
import type { AppEnv } from "../types";

export const corridorRoutes = createRouter();

corridorRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/corridors",
    tags: ["Corridors"],
    summary: "List corridors",
    description:
      "All corridors (18 short lines + CN & CPKC), without geometry. Fetch a single corridor for its GeoJSON.",
    responses: {
      200: jsonOf(z.array(CorridorSchema), "Corridor summaries"),
    },
  }),
  async (c) => {
    const list = await getDb()
      .select({
        id: corridors.id,
        slug: corridors.slug,
        name: corridors.name,
        operator: corridors.operator,
        description: corridors.description,
        railLineId: corridors.railLineId,
        metrics: corridors.metrics,
        createdAt: corridors.createdAt,
      })
      .from(corridors)
      .orderBy(corridors.name);
    return c.json(
      list.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
      200,
    );
  },
);

corridorRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/corridors/{slug}",
    tags: ["Corridors"],
    summary: "Get a corridor with geometry",
    request: { params: z.object({ slug: z.string() }) },
    responses: {
      200: jsonOf(CorridorDetailSchema, "Corridor detail incl. GeoJSON geometry"),
      ...notFound,
    },
  }),
  async (c) => {
    const { slug } = c.req.valid("param");
    const res = await getDb().execute(sql`
      SELECT id, slug, name, operator, description, metrics, created_at,
        ST_AsGeoJSON(geometry) AS geojson
      FROM corridors WHERE slug = ${slug}
    `);
    const rows = (res as unknown as { rows?: any[] }).rows ?? [];
    const row = rows[0];
    if (!row) throw new HTTPException(404, { message: "Corridor not found" });
    return c.json(
      {
        id: row.id,
        slug: row.slug,
        name: row.name,
        operator: row.operator,
        description: row.description,
        metrics: typeof row.metrics === "string" ? JSON.parse(row.metrics) : row.metrics,
        createdAt: new Date(row.created_at).toISOString(),
        geometry: row.geojson ? JSON.parse(row.geojson) : null,
      },
      200,
    );
  },
);

// --- Admin -------------------------------------------------------------

type CorridorRow = typeof corridors.$inferSelect;

function serializeAdmin(row: CorridorRow) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    operator: row.operator,
    description: row.description,
    railLineId: row.railLineId,
    metrics: row.metrics,
    createdAt: row.createdAt.toISOString(),
  };
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Error && /duplicate key|unique constraint/i.test(err.message);
}

async function getRailLineOr404(railLineId: string) {
  const [line] = await getDb()
    .select({ id: railLines.id, operator: railLines.operator })
    .from(railLines)
    .where(eq(railLines.id, railLineId));
  if (!line) throw new HTTPException(404, { message: "Rail line not found" });
  return line;
}

/**
 * Copy the rail line's geometry onto the corridor and tag the line's derived
 * graph (edges + nodes) with the corridor, so routing results and map layers
 * can attribute segments to it.
 */
async function attachRailLine(corridorId: string, railLineId: string) {
  const db = getDb();
  await db.execute(sql`
    UPDATE corridors
    SET geometry = (SELECT geometry FROM rail_lines WHERE id = ${railLineId}::uuid)
    WHERE id = ${corridorId}::uuid
  `);
  await db
    .update(railEdges)
    .set({ corridorId })
    .where(eq(railEdges.railLineId, railLineId));
  await db
    .update(railNodes)
    .set({ corridorId })
    .where(eq(railNodes.railLineId, railLineId));
}

/** Untag any rail graph rows currently attributed to the corridor. */
async function detachGraph(corridorId: string) {
  const db = getDb();
  await db
    .update(railEdges)
    .set({ corridorId: null })
    .where(eq(railEdges.corridorId, corridorId));
  await db
    .update(railNodes)
    .set({ corridorId: null })
    .where(eq(railNodes.corridorId, corridorId));
}

corridorRoutes.openapi(
  createRoute({
    method: "post",
    path: "/v1/admin/corridors",
    tags: ["Corridors"],
    summary: "Create a corridor",
    description:
      "Pass `railLineId` to build the corridor around an imported rail line: its geometry is copied onto the corridor and its routing graph is tagged with the corridor. Operator defaults to the rail line's operator.",
    security: bearerSecurity,
    request: {
      body: {
        content: { "application/json": { schema: CreateCorridorSchema } },
        required: true,
      },
    },
    responses: {
      201: jsonOf(CorridorSchema, "The created corridor"),
      ...unauthorized,
      ...forbidden,
      ...notFound,
      ...conflict,
    },
  }),
  async (c) => {
    await requireRole(c, ["admin"]);
    const body = c.req.valid("json");
    const slug = body.slug ?? slugify(body.name);
    if (!slug) {
      throw new HTTPException(400, { message: "Could not derive a slug from the name" });
    }

    const line = body.railLineId ? await getRailLineOr404(body.railLineId) : null;

    let row: CorridorRow;
    try {
      [row] = await getDb()
        .insert(corridors)
        .values({
          slug,
          name: body.name,
          operator: body.operator ?? line?.operator ?? null,
          description: body.description,
          railLineId: body.railLineId,
          metrics: body.metrics ?? {},
        })
        .returning();
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new HTTPException(409, { message: "A corridor with this slug already exists" });
      }
      throw err;
    }

    if (body.railLineId) await attachRailLine(row.id, body.railLineId);
    return c.json(serializeAdmin(row), 201);
  },
);

corridorRoutes.openapi(
  createRoute({
    method: "patch",
    path: "/v1/admin/corridors/{id}",
    tags: ["Corridors"],
    summary: "Update a corridor",
    security: bearerSecurity,
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: {
        content: { "application/json": { schema: UpdateCorridorSchema } },
        required: true,
      },
    },
    responses: {
      200: jsonOf(CorridorSchema, "The updated corridor"),
      ...unauthorized,
      ...forbidden,
      ...notFound,
      ...conflict,
    },
  }),
  async (c) => {
    await requireRole(c, ["admin"]);
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");

    if (body.railLineId) await getRailLineOr404(body.railLineId);

    const set: Partial<CorridorRow> = {};
    if (body.name !== undefined) set.name = body.name;
    if (body.slug !== undefined) set.slug = body.slug;
    if (body.operator !== undefined) set.operator = body.operator;
    if (body.description !== undefined) set.description = body.description;
    if (body.metrics !== undefined) set.metrics = body.metrics;
    if (body.railLineId !== undefined) set.railLineId = body.railLineId;

    let row: CorridorRow | undefined;
    try {
      [row] = await getDb()
        .update(corridors)
        .set(set)
        .where(eq(corridors.id, id))
        .returning();
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new HTTPException(409, { message: "A corridor with this slug already exists" });
      }
      throw err;
    }
    if (!row) throw new HTTPException(404, { message: "Corridor not found" });

    if (body.railLineId !== undefined) {
      await detachGraph(id);
      if (body.railLineId) await attachRailLine(id, body.railLineId);
    }
    return c.json(serializeAdmin(row), 200);
  },
);

corridorRoutes.openapi(
  createRoute({
    method: "delete",
    path: "/v1/admin/corridors/{id}",
    tags: ["Corridors"],
    summary: "Delete a corridor",
    security: bearerSecurity,
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      204: { description: "Deleted" },
      ...unauthorized,
      ...forbidden,
      ...notFound,
      409: jsonOf(z.object({ error: z.string() }), "Corridor is referenced by other records"),
    },
  }),
  async (c) => {
    await requireRole(c, ["admin"]);
    const { id } = c.req.valid("param");
    await detachGraph(id);
    try {
      const deleted = await getDb()
        .delete(corridors)
        .where(eq(corridors.id, id))
        .returning({ id: corridors.id });
      if (!deleted.length) {
        throw new HTTPException(404, { message: "Corridor not found" });
      }
    } catch (err) {
      if (err instanceof Error && /foreign key/i.test(err.message)) {
        throw new HTTPException(409, {
          message: "Corridor is referenced by listings, placements, or routes",
        });
      }
      throw err;
    }
    return c.body(null, 204);
  },
);
