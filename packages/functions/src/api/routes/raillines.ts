import { createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { sql } from "drizzle-orm";
import { getDb } from "@prairie-connect/core/db/client";
import {
  importRailLine,
  deleteRailLine,
  GeoJsonImportError,
} from "@prairie-connect/core/rail/import";
import { requireRole } from "../middleware/auth";
import {
  RailLineSchema,
  RailLineDetailSchema,
  ImportRailLineSchema,
  ImportRailLineResultSchema,
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

export const railLineRoutes = createRouter();

interface RailLineRow {
  id: string;
  slug: string;
  name: string;
  operator: string | null;
  description: string | null;
  source_name: string | null;
  edge_count: number | string;
  total_length_km: number | string | null;
  created_at: string | Date;
  geojson?: string | null;
}

function rows<T>(res: unknown): T[] {
  const r = res as { rows?: T[] };
  return (r.rows ?? (res as T[])) as T[];
}

function serialize(row: RailLineRow) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    operator: row.operator,
    description: row.description,
    sourceName: row.source_name,
    edgeCount: Number(row.edge_count),
    totalLengthKm: Number(row.total_length_km ?? 0),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Error && /duplicate key|unique constraint/i.test(err.message);
}

railLineRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/admin/raillines",
    tags: ["Rail lines"],
    summary: "List rail lines (admin)",
    security: bearerSecurity,
    responses: {
      200: jsonOf(z.array(RailLineSchema), "All imported rail lines with graph stats"),
      ...unauthorized,
      ...forbidden,
    },
  }),
  async (c) => {
    await requireRole(c, ["admin"]);
    const res = await getDb().execute(sql`
      SELECT rl.id, rl.slug, rl.name, rl.operator, rl.description,
        rl.source_name, rl.created_at,
        COUNT(e.id) AS edge_count,
        COALESCE(SUM(e.length_km), 0) AS total_length_km
      FROM rail_lines rl
      LEFT JOIN rail_edges e ON e.rail_line_id = rl.id
      GROUP BY rl.id
      ORDER BY rl.name
    `);
    return c.json(rows<RailLineRow>(res).map(serialize), 200);
  },
);

railLineRoutes.openapi(
  createRoute({
    method: "post",
    path: "/v1/admin/raillines",
    tags: ["Rail lines"],
    summary: "Import a rail line from GeoJSON",
    description:
      "Stores the line geometry and (by default) derives the pgRouting graph: one edge per source LineString, endpoints snapped onto existing nodes so separately imported lines stitch into one routable network.",
    security: bearerSecurity,
    request: {
      body: {
        content: { "application/json": { schema: ImportRailLineSchema } },
        required: true,
      },
    },
    responses: {
      201: jsonOf(ImportRailLineResultSchema, "Import summary"),
      400: jsonOf(z.object({ error: z.string() }), "Invalid GeoJSON"),
      ...unauthorized,
      ...forbidden,
      ...conflict,
    },
  }),
  async (c) => {
    await requireRole(c, ["admin"]);
    const body = c.req.valid("json");
    try {
      const result = await importRailLine({
        name: body.name,
        slug: body.slug,
        operator: body.operator,
        description: body.description,
        geojson: body.geojson,
        sourceName: body.sourceName,
        buildGraph: body.buildGraph,
        snapToleranceM: body.snapToleranceM,
      });
      return c.json(result, 201);
    } catch (err) {
      if (err instanceof GeoJsonImportError) {
        throw new HTTPException(400, { message: err.message });
      }
      if (isUniqueViolation(err)) {
        throw new HTTPException(409, {
          message: "A rail line with this slug already exists",
        });
      }
      throw err;
    }
  },
);

railLineRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/admin/raillines/{id}",
    tags: ["Rail lines"],
    summary: "Get a rail line with geometry (admin)",
    security: bearerSecurity,
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      200: jsonOf(RailLineDetailSchema, "Rail line detail incl. GeoJSON geometry"),
      ...unauthorized,
      ...forbidden,
      ...notFound,
    },
  }),
  async (c) => {
    await requireRole(c, ["admin"]);
    const { id } = c.req.valid("param");
    const res = await getDb().execute(sql`
      SELECT rl.id, rl.slug, rl.name, rl.operator, rl.description,
        rl.source_name, rl.created_at,
        ST_AsGeoJSON(rl.geometry) AS geojson,
        COUNT(e.id) AS edge_count,
        COALESCE(SUM(e.length_km), 0) AS total_length_km
      FROM rail_lines rl
      LEFT JOIN rail_edges e ON e.rail_line_id = rl.id
      WHERE rl.id = ${id}::uuid
      GROUP BY rl.id
    `);
    const row = rows<RailLineRow>(res)[0];
    if (!row) throw new HTTPException(404, { message: "Rail line not found" });
    return c.json(
      {
        ...serialize(row),
        geometry: row.geojson ? JSON.parse(row.geojson) : null,
      },
      200,
    );
  },
);

railLineRoutes.openapi(
  createRoute({
    method: "delete",
    path: "/v1/admin/raillines/{id}",
    tags: ["Rail lines"],
    summary: "Delete a rail line and its derived graph",
    description:
      "Removes the line, its edges, and nodes not shared with other lines. Corridors built on it keep their copied geometry but lose the link.",
    security: bearerSecurity,
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      204: { description: "Deleted" },
      ...unauthorized,
      ...forbidden,
      ...notFound,
    },
  }),
  async (c) => {
    await requireRole(c, ["admin"]);
    const { id } = c.req.valid("param");
    const deleted = await deleteRailLine(id);
    if (!deleted) throw new HTTPException(404, { message: "Rail line not found" });
    return c.body(null, 204);
  },
);
