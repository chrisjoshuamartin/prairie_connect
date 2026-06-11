import { createRoute, z } from "@hono/zod-openapi";
import { MAP_LAYERS } from "@prairie-connect/core/map/layers";
import { MapLayerSchema } from "../schemas";
import { createRouter, jsonOf } from "../openapi";

export const mapRoutes = createRouter();

mapRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/map/layers",
    tags: ["Map"],
    summary: "List available map layers",
    description:
      'The registry of map layers the UI can render — short lines, Class I connections, interchanges, ports, transloads, communities, development sites, resource clusters, route segments, featured partners. Layers report "available" or "planned" so the frontend stays config-driven and picks up new layers without code changes. `source.hint` says where to fetch the data today.',
    responses: {
      200: jsonOf(z.array(MapLayerSchema), "All registered layers"),
    },
  }),
  (c) => c.json(MAP_LAYERS, 200),
);
