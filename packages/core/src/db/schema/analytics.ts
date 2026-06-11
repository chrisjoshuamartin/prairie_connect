import {
  pgTable,
  bigserial,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

/**
 * Lightweight product analytics. Open event vocabulary (validated for
 * shape, not against an enum) so the frontend can add events without API
 * changes — e.g. intent_selected, search_performed, listing_viewed,
 * corridor_viewed, route_generated, partner_card_clicked,
 * contact_button_clicked, ai_prompt_used, document_downloaded.
 */
export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    type: text("type").notNull(),
    payload: jsonb("payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    /** Client-generated session id for funnel stitching. */
    sessionId: text("session_id"),
    page: text("page"),
    /** Set when the user was signed in. */
    userId: uuid("user_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("analytics_events_type_created_idx").on(t.type, t.createdAt)],
);
