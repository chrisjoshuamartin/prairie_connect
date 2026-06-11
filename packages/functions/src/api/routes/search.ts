import { createRoute, z } from "@hono/zod-openapi";
import { searchProvider } from "@prairie-connect/core/search/index";
import { SECTORS } from "@prairie-connect/core/db/schema/index";
import { SearchHitSchema } from "../schemas";
import { createRouter, jsonOf } from "../openapi";
import type { AppEnv } from "../types";

export const searchRoutes = createRouter();

const searchQuerySchema = z.object({
  q: z.string().min(1).max(200),
  sector: z.enum(SECTORS).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().positive().max(2000).optional(),
  mode: z.enum(["keyword", "semantic", "hybrid"]).default("keyword"),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

searchRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/search",
    tags: ["Search"],
    summary: "Search the directory",
    description:
      "Full-text + fuzzy search over published directory listings, with optional sector and geo-radius filters. `mode=semantic` uses vector similarity; `mode=hybrid` fuses both rankings.",
    request: { query: searchQuerySchema },
    responses: {
      200: jsonOf(z.array(SearchHitSchema), "Ranked search hits"),
    },
  }),
  async (c) => {
    const q = c.req.valid("query");
    const hits = await searchProvider.search({
      q: q.q,
      sector: q.sector,
      mode: q.mode,
      limit: q.limit,
      near:
        q.lat !== undefined && q.lng !== undefined && q.radiusKm !== undefined
          ? { lat: q.lat, lng: q.lng, radiusKm: q.radiusKm }
          : undefined,
    });
    return c.json(hits, 200);
  },
);

searchRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/search/suggest",
    tags: ["Search"],
    summary: "Autocomplete suggestions",
    request: {
      query: z.object({
        q: z.string().min(1).max(100),
        limit: z.coerce.number().int().positive().max(20).default(8),
      }),
    },
    responses: {
      200: jsonOf(z.array(z.string()), "Listing-name suggestions"),
    },
  }),
  async (c) => {
    const { q, limit } = c.req.valid("query");
    return c.json(await searchProvider.suggest(q, limit), 200);
  },
);
