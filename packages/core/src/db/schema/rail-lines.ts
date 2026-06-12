import { pgTable, uuid, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { geographyMultiLineString } from "./types";

/**
 * Source-of-truth geometry for a rail line, imported from GeoJSON via the
 * admin tooling. Corridors are built around a rail line, and the routing
 * graph (rail_nodes / rail_edges) is derived from its segments at import
 * time. `properties` keeps whatever feature properties came with the
 * source file for provenance.
 */
export const railLines = pgTable("rail_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  operator: text("operator"),
  description: text("description"),
  geometry: geographyMultiLineString("geometry").notNull(),
  properties: jsonb("properties")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  /** Original filename (or URL) the GeoJSON came from. */
  sourceName: text("source_name"),
  /** S3 key in AssetsBucket, e.g. logos/{id}/logo.png */
  logoKey: text("logo_key"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
