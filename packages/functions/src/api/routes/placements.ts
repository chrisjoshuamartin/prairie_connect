import { createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@prairie-connect/core/db/client";
import { featuredPlacements } from "@prairie-connect/core/db/schema/index";
import { requireRole } from "../middleware/auth";
import {
  PlacementSchema,
  AdminPlacementSchema,
  CreatePlacementSchema,
} from "../schemas";
import {
  createRouter,
  jsonOf,
  unauthorized,
  forbidden,
  notFound,
  bearerSecurity,
} from "../openapi";

export const placementRoutes = createRouter();

type PlacementRow = typeof featuredPlacements.$inferSelect;

export interface PlacementContext {
  page?: string;
  sector?: string;
  region?: string;
  corridor?: string;
  intent?: string;
  listingType?: string;
}

/**
 * A placement matches when, for every dimension the request specifies, the
 * placement either doesn't target that dimension (empty/absent = anywhere)
 * or its targets include the requested value. Inventory is small, so we
 * filter in app code rather than composing jsonb SQL.
 */
function matches(row: PlacementRow, ctx: PlacementContext): boolean {
  const t = row.targeting ?? {};
  const dim = (targets: string[] | undefined, value: string | undefined) =>
    !value || !targets?.length || targets.includes(value);
  return (
    dim(t.pages, ctx.page) &&
    dim(t.sectors, ctx.sector) &&
    dim(t.regions, ctx.region?.toLowerCase()) &&
    dim(t.corridors, ctx.corridor) &&
    dim(t.intents, ctx.intent) &&
    dim(t.listingTypes, ctx.listingType)
  );
}

function isLive(row: PlacementRow, now: Date): boolean {
  if (!row.active) return false;
  if (row.startsAt && row.startsAt > now) return false;
  if (row.endsAt && row.endsAt < now) return false;
  return true;
}

/** Active, in-window placements matching the given context, by weight. */
export async function matchPlacements(
  ctx: PlacementContext,
): Promise<PlacementRow[]> {
  const now = new Date();
  const rows = await getDb()
    .select()
    .from(featuredPlacements)
    .where(eq(featuredPlacements.active, true))
    .orderBy(desc(featuredPlacements.weight), desc(featuredPlacements.createdAt));
  return rows.filter((r) => isLive(r, now) && matches(r, ctx));
}

export function serializePlacement(row: PlacementRow) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    imageUrl: row.imageUrl,
    linkUrl: row.linkUrl,
    listingId: row.listingId,
    corridorId: row.corridorId,
    weight: row.weight,
  };
}

function serializeAdmin(row: PlacementRow) {
  return {
    ...serializePlacement(row),
    targeting: {
      pages: row.targeting?.pages ?? [],
      sectors: (row.targeting?.sectors ?? []) as any,
      regions: row.targeting?.regions ?? [],
      corridors: row.targeting?.corridors ?? [],
      intents: row.targeting?.intents ?? [],
      listingTypes: row.targeting?.listingTypes ?? [],
    },
    active: row.active,
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

const placementQuery = z.object({
  page: z
    .string()
    .max(50)
    .optional()
    .describe("UI surface: home | search | directory | corridor | intent | listing | route-finder | map"),
  sector: z.string().max(50).optional(),
  region: z.string().max(10).optional().describe("Province code: bc | ab | sk | mb"),
  corridor: z.string().max(100).optional().describe("Corridor slug"),
  intent: z.string().max(100).optional().describe("Intent slug"),
  listingType: z.string().max(50).optional(),
});

placementRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/featured-placements",
    tags: ["Featured placements"],
    summary: "Get placements for a surface",
    description:
      "Premium listings, corridor sponsors, and featured partners targeted at the current context. All filters are optional; placements that don't target a dimension match any value for it. Results are ordered by weight.\n\nExamples: `?page=search&sector=agrivalue&region=sk`, `?corridor=gwr`, `?intent=move-goods-by-rail`, `?listingType=transload`.",
    request: { query: placementQuery },
    responses: {
      200: jsonOf(z.array(PlacementSchema), "Matching placements, heaviest first"),
    },
  }),
  async (c) => {
    const ctx = c.req.valid("query");
    const rows = await matchPlacements(ctx);
    return c.json(rows.map(serializePlacement), 200);
  },
);

placementRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/admin/placements",
    tags: ["Featured placements"],
    summary: "List all placements (admin)",
    security: bearerSecurity,
    responses: {
      200: jsonOf(z.array(AdminPlacementSchema), "All placements, including inactive"),
      ...unauthorized,
      ...forbidden,
    },
  }),
  async (c) => {
    await requireRole(c, ["admin"]);
    const rows = await getDb()
      .select()
      .from(featuredPlacements)
      .orderBy(desc(featuredPlacements.weight), desc(featuredPlacements.createdAt));
    return c.json(rows.map(serializeAdmin), 200);
  },
);

placementRoutes.openapi(
  createRoute({
    method: "post",
    path: "/v1/admin/placements",
    tags: ["Featured placements"],
    summary: "Create a placement",
    security: bearerSecurity,
    request: {
      body: { content: { "application/json": { schema: CreatePlacementSchema } }, required: true },
    },
    responses: {
      201: jsonOf(AdminPlacementSchema, "The created placement"),
      ...unauthorized,
      ...forbidden,
    },
  }),
  async (c) => {
    await requireRole(c, ["admin"]);
    const body = c.req.valid("json");
    const [row] = await getDb()
      .insert(featuredPlacements)
      .values({
        title: body.title,
        description: body.description,
        imageUrl: body.imageUrl,
        linkUrl: body.linkUrl,
        listingId: body.listingId,
        corridorId: body.corridorId,
        targeting: body.targeting ?? {},
        weight: body.weight,
        active: body.active,
        startsAt: body.startsAt ? new Date(body.startsAt) : null,
        endsAt: body.endsAt ? new Date(body.endsAt) : null,
      })
      .returning();
    return c.json(serializeAdmin(row), 201);
  },
);

placementRoutes.openapi(
  createRoute({
    method: "patch",
    path: "/v1/admin/placements/{id}",
    tags: ["Featured placements"],
    summary: "Update a placement",
    security: bearerSecurity,
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: {
        content: { "application/json": { schema: CreatePlacementSchema.partial() } },
        required: true,
      },
    },
    responses: {
      200: jsonOf(AdminPlacementSchema, "The updated placement"),
      ...unauthorized,
      ...forbidden,
      ...notFound,
    },
  }),
  async (c) => {
    await requireRole(c, ["admin"]);
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");

    const set: Record<string, unknown> = {};
    if (body.title !== undefined) set.title = body.title;
    if (body.description !== undefined) set.description = body.description;
    if (body.imageUrl !== undefined) set.imageUrl = body.imageUrl;
    if (body.linkUrl !== undefined) set.linkUrl = body.linkUrl;
    if (body.listingId !== undefined) set.listingId = body.listingId;
    if (body.corridorId !== undefined) set.corridorId = body.corridorId;
    if (body.targeting !== undefined) set.targeting = body.targeting;
    if (body.weight !== undefined) set.weight = body.weight;
    if (body.active !== undefined) set.active = body.active;
    if (body.startsAt !== undefined) set.startsAt = new Date(body.startsAt);
    if (body.endsAt !== undefined) set.endsAt = new Date(body.endsAt);

    const [row] = await getDb()
      .update(featuredPlacements)
      .set(set)
      .where(eq(featuredPlacements.id, id))
      .returning();
    if (!row) throw new HTTPException(404, { message: "Placement not found" });
    return c.json(serializeAdmin(row), 200);
  },
);

placementRoutes.openapi(
  createRoute({
    method: "delete",
    path: "/v1/admin/placements/{id}",
    tags: ["Featured placements"],
    summary: "Delete a placement",
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
    const deleted = await getDb()
      .delete(featuredPlacements)
      .where(eq(featuredPlacements.id, id))
      .returning({ id: featuredPlacements.id });
    if (!deleted.length) {
      throw new HTTPException(404, { message: "Placement not found" });
    }
    return c.body(null, 204);
  },
);
