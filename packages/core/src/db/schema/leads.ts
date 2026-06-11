import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";

export const LEAD_STATUSES = ["new", "contacted", "qualified", "closed"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/**
 * Inquiry capture — "contact this railway", "request an opportunity pack",
 * etc. The related_* ids are soft references (no FKs) so a lead survives
 * the listing/route it referenced being deleted; the source context matters
 * more than referential integrity here.
 */
export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    organization: text("organization"),
    phone: text("phone"),
    message: text("message"),
    /** Intent slug active when the lead was captured. */
    intent: text("intent"),
    relatedListingId: uuid("related_listing_id"),
    relatedCorridorId: uuid("related_corridor_id"),
    relatedRouteId: uuid("related_route_id"),
    sourcePage: text("source_page"),
    /** Set when the submitter was signed in. */
    userId: uuid("user_id"),
    status: text("status").$type<LeadStatus>().notNull().default("new"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("leads_status_created_idx").on(t.status, t.createdAt)],
);
