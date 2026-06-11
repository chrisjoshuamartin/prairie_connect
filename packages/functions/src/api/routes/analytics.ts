import { createRoute, z } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";
import { getDb } from "@prairie-connect/core/db/client";
import { analyticsEvents, users } from "@prairie-connect/core/db/schema/index";
import { AnalyticsBatchSchema } from "../schemas";
import { createRouter, jsonOf } from "../openapi";

export const analyticsRoutes = createRouter();

analyticsRoutes.openapi(
  createRoute({
    method: "post",
    path: "/v1/analytics/events",
    tags: ["Analytics"],
    summary: "Record product analytics events",
    description:
      "Lightweight, batched event ingest (1-50 events per call). The event vocabulary is open — suggested types: intent_selected, search_performed, listing_viewed, corridor_viewed, route_generated, partner_card_clicked, contact_button_clicked, ai_prompt_used, document_downloaded. Send a client-generated sessionId to stitch funnels. No auth required; signed-in users are attributed automatically.",
    request: {
      body: { content: { "application/json": { schema: AnalyticsBatchSchema } }, required: true },
    },
    responses: {
      202: jsonOf(z.object({ accepted: z.number() }), "Events accepted"),
    },
  }),
  async (c) => {
    const { events } = c.req.valid("json");
    const auth = c.get("auth");
    const db = getDb();

    let userId: string | null = null;
    if (auth) {
      const [user] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.cognitoSub, auth.sub));
      userId = user?.id ?? null;
    }

    await db.insert(analyticsEvents).values(
      events.map((e) => ({
        type: e.type,
        payload: e.payload ?? {},
        sessionId: e.sessionId,
        page: e.page,
        userId,
      })),
    );

    return c.json({ accepted: events.length }, 202);
  },
);
