import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export interface RouteEndpoint {
  label?: string;
  lat: number;
  lng: number;
}

export interface RouteSegment {
  seq: number;
  edgeId: number | null;
  mode: string;
  operator: string | null;
  fromNode: { id: number; name: string | null };
  toNode: { id: number; name: string | null };
  lengthKm: number | null;
}

/**
 * Saved ("trained") routes. `segments` is the ordered pgr_dijkstra result;
 * `geometry` is a GeoJSON FeatureCollection ready for the map. Curated
 * routes are verified by admins and can feed cost-weight tuning.
 */
export const savedRoutes = pgTable("saved_routes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  name: text("name").notNull(),
  origin: jsonb("origin").$type<RouteEndpoint>().notNull(),
  destination: jsonb("destination").$type<RouteEndpoint>().notNull(),
  segments: jsonb("segments").$type<RouteSegment[]>().notNull().default([]),
  geometry: jsonb("geometry").$type<Record<string, unknown> | null>(),
  reverse: boolean("reverse").notNull().default(false),
  curated: boolean("curated").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
