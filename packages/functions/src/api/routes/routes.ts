import { createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@prairie-connect/core/db/client";
import { savedRoutes } from "@prairie-connect/core/db/schema/index";
import { findRoute } from "@prairie-connect/core/routing/pathfind";
import { requireDbUser } from "../middleware/auth";
import {
  RouteEndpointSchema,
  RouteResultSchema,
  SavedRouteSchema,
} from "../schemas";
import {
  createRouter,
  jsonOf,
  unauthorized,
  forbidden,
  notFound,
  bearerSecurity,
} from "../openapi";
import type { AppEnv } from "../types";

export const routeRoutes = createRouter();

type SavedRouteRow = typeof savedRoutes.$inferSelect;

function serialize(route: SavedRouteRow) {
  return {
    id: route.id,
    name: route.name,
    origin: route.origin,
    destination: route.destination,
    segments: route.segments,
    geometry: route.geometry ?? null,
    reverse: route.reverse,
    curated: route.curated,
    createdAt: route.createdAt.toISOString(),
  };
}

const FindRouteSchema = z
  .object({
    origin: RouteEndpointSchema,
    destination: RouteEndpointSchema,
    reverse: z
      .boolean()
      .default(false)
      .describe("Reverse routing (site -> markets) uses reverse cost weights"),
  })
  .openapi("FindRouteRequest");

routeRoutes.openapi(
  createRoute({
    method: "post",
    path: "/v1/routes/find",
    tags: ["Routing"],
    summary: "Find a route across the rail network",
    description:
      "Snaps origin/destination to the nearest rail nodes and runs pgRouting (Dijkstra) over the network graph. Returns ordered segments plus a GeoJSON FeatureCollection for the map.",
    request: {
      body: { content: { "application/json": { schema: FindRouteSchema } }, required: true },
    },
    responses: {
      200: jsonOf(RouteResultSchema, "The computed route"),
      404: jsonOf(
        z.object({ error: z.string() }),
        "No route found (empty network or disconnected nodes)",
      ),
    },
  }),
  async (c) => {
    const body = c.req.valid("json");
    const result = await findRoute(body);
    if (!result) {
      throw new HTTPException(404, {
        message: "No route found between those points",
      });
    }
    return c.json(result, 200);
  },
);

const SaveRouteSchema = FindRouteSchema.extend({
  name: z.string().min(1).max(200),
}).openapi("SaveRouteRequest");

routeRoutes.openapi(
  createRoute({
    method: "post",
    path: "/v1/routes",
    tags: ["Routing"],
    summary: "Compute and save a route",
    security: bearerSecurity,
    request: {
      body: { content: { "application/json": { schema: SaveRouteSchema } }, required: true },
    },
    responses: {
      201: jsonOf(SavedRouteSchema, "The saved route"),
      ...unauthorized,
      404: jsonOf(z.object({ error: z.string() }), "No route found"),
    },
  }),
  async (c) => {
    const user = await requireDbUser(c);
    const body = c.req.valid("json");
    const result = await findRoute(body);
    if (!result) {
      throw new HTTPException(404, {
        message: "No route found between those points",
      });
    }
    const [saved] = await getDb()
      .insert(savedRoutes)
      .values({
        userId: user.id,
        name: body.name,
        origin: body.origin,
        destination: body.destination,
        segments: result.segments,
        geometry: result.geometry as unknown as Record<string, unknown>,
        reverse: body.reverse,
      })
      .returning();
    return c.json(serialize(saved), 201);
  },
);

routeRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/routes",
    tags: ["Routing"],
    summary: "List my saved routes",
    security: bearerSecurity,
    responses: {
      200: jsonOf(z.array(SavedRouteSchema), "The user's saved routes"),
      ...unauthorized,
    },
  }),
  async (c) => {
    const user = await requireDbUser(c);
    const list = await getDb()
      .select()
      .from(savedRoutes)
      .where(eq(savedRoutes.userId, user.id))
      .orderBy(desc(savedRoutes.createdAt));
    return c.json(list.map(serialize), 200);
  },
);

routeRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/routes/{id}",
    tags: ["Routing"],
    summary: "Get a saved route",
    security: bearerSecurity,
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      200: jsonOf(SavedRouteSchema, "The saved route"),
      ...unauthorized,
      ...forbidden,
      ...notFound,
    },
  }),
  async (c) => {
    const user = await requireDbUser(c);
    const { id } = c.req.valid("param");
    const [route] = await getDb()
      .select()
      .from(savedRoutes)
      .where(eq(savedRoutes.id, id));
    if (!route) throw new HTTPException(404, { message: "Route not found" });
    if (route.userId !== user.id && !route.curated && user.role !== "admin") {
      throw new HTTPException(403, { message: "Not your route" });
    }
    return c.json(serialize(route), 200);
  },
);

routeRoutes.openapi(
  createRoute({
    method: "delete",
    path: "/v1/routes/{id}",
    tags: ["Routing"],
    summary: "Delete a saved route",
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
    const user = await requireDbUser(c);
    const { id } = c.req.valid("param");
    const [route] = await getDb()
      .select()
      .from(savedRoutes)
      .where(eq(savedRoutes.id, id));
    if (!route) throw new HTTPException(404, { message: "Route not found" });
    if (route.userId !== user.id && user.role !== "admin") {
      throw new HTTPException(403, { message: "Not your route" });
    }
    await getDb().delete(savedRoutes).where(eq(savedRoutes.id, id));
    return c.body(null, 204);
  },
);
