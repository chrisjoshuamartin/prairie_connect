import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const ORG_TYPES = [
  "shipper",
  "processor",
  "logistics",
  "railway",
  "edo",
  "other",
] as const;
export type OrgType = (typeof ORG_TYPES)[number];

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  type: text("type").$type<OrgType>().notNull().default("other"),
  website: text("website"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
