import { createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { sql } from "drizzle-orm";
import { getDb } from "@prairie-connect/core/db/client";
import {
  importRailLine,
  deleteRailLine,
  GeoJsonImportError,
} from "@prairie-connect/core/rail/import";
import { updateRailLine } from "@prairie-connect/core/rail/update";
import {
  logoPublicUrl,
  createRailLineLogoUploadUrl,
  setRailLineLogo,
  deleteRailLineLogo,
} from "@prairie-connect/core/rail/logos";
import { requireRole } from "../middleware/auth";
import {
  RailLineSchema,
  RailLineDetailSchema,
  ImportRailLineSchema,
  ImportRailLineResultSchema,
  UpdateRailLineSchema,
  UpdateRailLineResultSchema,
  RailLineLogoUploadUrlSchema,
  RailLineLogoUploadUrlResponseSchema,
  SetRailLineLogoSchema,
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
  logo_key: string | null;
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
  const logoKey = row.logo_key ?? null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    operator: row.operator,
    description: row.description,
    sourceName: row.source_name,
    logoKey,
    logoUrl: logoKey ? logoPublicUrl(logoKey) : null,
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
        rl.source_name, rl.logo_key, rl.created_at,
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
        rl.source_name, rl.logo_key, rl.created_at,
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
    method: "patch",
    path: "/v1/admin/raillines/{id}",
    tags: ["Rail lines"],
    summary: "Update a rail line",
    description:
      "Edit metadata (name, slug, operator, description). Optionally replace geometry from GeoJSON, which clears and rebuilds the derived routing graph and syncs linked corridors.",
    security: bearerSecurity,
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: {
        content: { "application/json": { schema: UpdateRailLineSchema } },
        required: true,
      },
    },
    responses: {
      200: jsonOf(UpdateRailLineResultSchema, "Updated rail line"),
      400: jsonOf(z.object({ error: z.string() }), "Invalid GeoJSON"),
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
    try {
      const result = await updateRailLine(id, {
        name: body.name,
        slug: body.slug,
        operator: body.operator,
        description: body.description,
        geojson: body.geojson,
        sourceName: body.sourceName,
        rebuildGraph: body.rebuildGraph,
        snapToleranceM: body.snapToleranceM,
      });
      if (!result) throw new HTTPException(404, { message: "Rail line not found" });
      return c.json(result, 200);
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
    method: "post",
    path: "/v1/admin/raillines/{id}/logo/upload-url",
    tags: ["Rail lines"],
    summary: "Get a presigned URL to upload a rail line logo",
    description:
      "Returns a presigned PUT URL for the public assets bucket. Upload the image bytes directly (same Content-Type), then PATCH the rail line with the returned `key` as `logoKey`.",
    security: bearerSecurity,
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: {
        content: { "application/json": { schema: RailLineLogoUploadUrlSchema } },
        required: true,
      },
    },
    responses: {
      200: jsonOf(RailLineLogoUploadUrlResponseSchema, "Presigned upload URL"),
      400: jsonOf(z.object({ error: z.string() }), "Invalid content type"),
      ...unauthorized,
      ...forbidden,
      ...notFound,
    },
  }),
  async (c) => {
    await requireRole(c, ["admin"]);
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    try {
      return c.json(
        await createRailLineLogoUploadUrl({
          railLineId: id,
          filename: body.filename,
          contentType: body.contentType,
        }),
        200,
      );
    } catch (err) {
      if (err instanceof Error && err.message === "Rail line not found") {
        throw new HTTPException(404, { message: err.message });
      }
      throw new HTTPException(400, {
        message: err instanceof Error ? err.message : "Invalid upload request",
      });
    }
  },
);

railLineRoutes.openapi(
  createRoute({
    method: "patch",
    path: "/v1/admin/raillines/{id}/logo",
    tags: ["Rail lines"],
    summary: "Attach an uploaded logo to a rail line",
    security: bearerSecurity,
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: {
        content: { "application/json": { schema: SetRailLineLogoSchema } },
        required: true,
      },
    },
    responses: {
      200: jsonOf(
        z.object({ logoKey: z.string(), logoUrl: z.string() }),
        "Logo attached",
      ),
      ...unauthorized,
      ...forbidden,
      ...notFound,
    },
  }),
  async (c) => {
    await requireRole(c, ["admin"]);
    const { id } = c.req.valid("param");
    const { logoKey } = c.req.valid("json");
    try {
      return c.json(await setRailLineLogo(id, logoKey), 200);
    } catch (err) {
      if (err instanceof Error && err.message === "Rail line not found") {
        throw new HTTPException(404, { message: err.message });
      }
      throw new HTTPException(400, {
        message: err instanceof Error ? err.message : "Invalid logo key",
      });
    }
  },
);

railLineRoutes.openapi(
  createRoute({
    method: "delete",
    path: "/v1/admin/raillines/{id}/logo",
    tags: ["Rail lines"],
    summary: "Remove a rail line logo",
    security: bearerSecurity,
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      204: { description: "Logo removed" },
      ...unauthorized,
      ...forbidden,
      ...notFound,
    },
  }),
  async (c) => {
    await requireRole(c, ["admin"]);
    const { id } = c.req.valid("param");
    try {
      await deleteRailLineLogo(id);
    } catch (err) {
      if (err instanceof Error && err.message === "Rail line not found") {
        throw new HTTPException(404, { message: err.message });
      }
      throw err;
    }
    return c.body(null, 204);
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
