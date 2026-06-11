import { createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@prairie-connect/core/db/client";
import {
  intents,
  corridors,
  directoryListings,
  savedRoutes,
} from "@prairie-connect/core/db/schema/index";
import { requireRole } from "../middleware/auth";
import {
  IntentSummarySchema,
  IntentDetailSchema,
  UpsertIntentSchema,
} from "../schemas";
import {
  createRouter,
  jsonOf,
  unauthorized,
  forbidden,
  notFound,
  bearerSecurity,
} from "../openapi";
import { matchPlacements, serializePlacement } from "./placements";

export const intentRoutes = createRouter();

type IntentRow = typeof intents.$inferSelect;

function serialize(intent: IntentRow) {
  return {
    slug: intent.slug,
    title: intent.title,
    intro: intent.intro,
    icon: intent.icon,
    sortOrder: intent.sortOrder,
    config: {
      searchTerms: intent.config.searchTerms ?? [],
      defaultFilters: intent.config.defaultFilters,
      destinationPath: intent.config.destinationPath,
      ctas: intent.config.ctas ?? [],
      guidedQuestions: intent.config.guidedQuestions ?? [],
      aiPrompts: intent.config.aiPrompts ?? [],
      relatedCorridorSlugs: intent.config.relatedCorridorSlugs ?? [],
    },
  };
}

intentRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/intents",
    tags: ["Intents"],
    summary: "List guided pathways",
    description:
      'The curated "I want to..." pathways for the home screen. Each carries default filters, suggested search terms, a destination page, CTA buttons, and AI starter prompts — so basic navigation never needs an AI call.',
    responses: {
      200: jsonOf(z.array(IntentSummarySchema), "Active pathways, in display order"),
    },
  }),
  async (c) => {
    const rows = await getDb()
      .select()
      .from(intents)
      .where(eq(intents.active, true))
      .orderBy(asc(intents.sortOrder));
    return c.json(rows.map(serialize), 200);
  },
);

intentRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/intents/{slug}",
    tags: ["Intents"],
    summary: "Get a pathway with resolved content",
    description:
      "Everything needed to render a pathway page: copy, guided questions, CTAs, AI starter prompts, plus resolved related corridors, related listings, curated routes, and featured placements targeted at this intent.",
    request: { params: z.object({ slug: z.string() }) },
    responses: {
      200: jsonOf(IntentDetailSchema, "The pathway with resolved relations"),
      ...notFound,
    },
  }),
  async (c) => {
    const { slug } = c.req.valid("param");
    const db = getDb();

    const [intent] = await db
      .select()
      .from(intents)
      .where(and(eq(intents.slug, slug), eq(intents.active, true)));
    if (!intent) throw new HTTPException(404, { message: "Intent not found" });

    const corridorSlugs = intent.config.relatedCorridorSlugs ?? [];
    const sector = intent.config.defaultFilters?.sector;

    const [relatedCorridors, relatedListings, suggestedRoutes, placements] =
      await Promise.all([
        corridorSlugs.length
          ? db
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
              .where(inArray(corridors.slug, corridorSlugs))
          : Promise.resolve([]),
        db
          .select()
          .from(directoryListings)
          .where(
            and(
              eq(directoryListings.status, "published"),
              ...(sector ? [eq(directoryListings.sector, sector as any)] : []),
            ),
          )
          .orderBy(desc(directoryListings.verified), desc(directoryListings.createdAt))
          .limit(6),
        db
          .select()
          .from(savedRoutes)
          .where(eq(savedRoutes.curated, true))
          .orderBy(desc(savedRoutes.createdAt))
          .limit(3),
        matchPlacements({ page: "intent", intent: slug }),
      ]);

    return c.json(
      {
        ...serialize(intent),
        relatedCorridors: relatedCorridors.map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
        })),
        relatedListings: relatedListings.map((l) => ({
          id: l.id,
          name: l.name,
          slug: l.slug,
          description: l.description,
          sector: l.sector,
          tags: l.tags,
          address: l.address,
          city: l.city,
          province: l.province,
          verified: l.verified,
          status: l.status,
          createdAt: l.createdAt.toISOString(),
          updatedAt: l.updatedAt.toISOString(),
        })),
        suggestedRoutes: suggestedRoutes.map((r) => ({
          id: r.id,
          name: r.name,
          origin: r.origin,
          destination: r.destination,
          segments: r.segments,
          geometry: r.geometry ?? null,
          reverse: r.reverse,
          curated: r.curated,
          createdAt: r.createdAt.toISOString(),
        })),
        featuredPlacements: placements.map(serializePlacement),
      },
      200,
    );
  },
);

intentRoutes.openapi(
  createRoute({
    method: "put",
    path: "/v1/admin/intents/{slug}",
    tags: ["Intents"],
    summary: "Create or update a pathway",
    security: bearerSecurity,
    request: {
      params: z.object({ slug: z.string().min(1).max(100) }),
      body: { content: { "application/json": { schema: UpsertIntentSchema } }, required: true },
    },
    responses: {
      200: jsonOf(IntentSummarySchema, "The saved pathway"),
      ...unauthorized,
      ...forbidden,
    },
  }),
  async (c) => {
    await requireRole(c, ["admin"]);
    const { slug } = c.req.valid("param");
    const body = c.req.valid("json");
    const db = getDb();

    const values = {
      title: body.title,
      intro: body.intro ?? null,
      icon: body.icon ?? null,
      sortOrder: body.sortOrder,
      active: body.active,
      config: body.config,
    };

    const [saved] = await db
      .insert(intents)
      .values({ slug, ...values })
      .onConflictDoUpdate({
        target: intents.slug,
        set: { ...values, updatedAt: new Date() },
      })
      .returning();

    return c.json(serialize(saved), 200);
  },
);

intentRoutes.openapi(
  createRoute({
    method: "delete",
    path: "/v1/admin/intents/{slug}",
    tags: ["Intents"],
    summary: "Delete a pathway",
    security: bearerSecurity,
    request: { params: z.object({ slug: z.string() }) },
    responses: {
      204: { description: "Deleted" },
      ...unauthorized,
      ...forbidden,
      ...notFound,
    },
  }),
  async (c) => {
    await requireRole(c, ["admin"]);
    const { slug } = c.req.valid("param");
    const deleted = await getDb()
      .delete(intents)
      .where(eq(intents.slug, slug))
      .returning({ slug: intents.slug });
    if (!deleted.length) {
      throw new HTTPException(404, { message: "Intent not found" });
    }
    return c.body(null, 204);
  },
);
