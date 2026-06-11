import { createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { sql } from "drizzle-orm";
import { getDb } from "@prairie-connect/core/db/client";
import { corridors } from "@prairie-connect/core/db/schema/index";
import { CorridorSchema, CorridorDetailSchema } from "../schemas";
import { createRouter, jsonOf, notFound } from "../openapi";
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
