import { pgTable, uuid, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { geographyMultiLineString } from "./types";

/**
 * One row per short line corridor (18 short lines + CN & CPKC per the
 * Corridor Atlas spec). `metrics` holds the corridor summary JSON outputs
 * (towns, development sites, interchange connectivity, etc.).
 */
export const corridors = pgTable("corridors", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  operator: text("operator"),
  description: text("description"),
  geometry: geographyMultiLineString("geometry"),
  metrics: jsonb("metrics").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
