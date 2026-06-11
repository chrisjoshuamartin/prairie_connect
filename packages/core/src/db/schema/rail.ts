import {
  pgTable,
  bigserial,
  bigint,
  uuid,
  text,
  doublePrecision,
  jsonb,
} from "drizzle-orm/pg-core";
import { corridors } from "./corridors";
import { railLines } from "./rail-lines";
import { geographyPoint, geographyLineString } from "./types";

export const NODE_KINDS = [
  "station",
  "interchange",
  "port",
  "transload",
  "junction",
  "terminal",
] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

export const EDGE_MODES = ["shortline", "class1", "truck"] as const;
export type EdgeMode = (typeof EDGE_MODES)[number];

/**
 * Rail network graph for pgRouting. Integer (bigserial) ids because
 * pgr_dijkstra requires integer node/edge identifiers.
 */
export const railNodes = pgTable("rail_nodes", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: text("name"),
  kind: text("kind").$type<NodeKind>().notNull().default("station"),
  corridorId: uuid("corridor_id").references(() => corridors.id),
  /** Set when the node was created by a rail line import. */
  railLineId: uuid("rail_line_id").references(() => railLines.id),
  location: geographyPoint("location").notNull(),
});

export const railEdges = pgTable("rail_edges", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  sourceId: bigint("source_id", { mode: "number" })
    .notNull()
    .references(() => railNodes.id),
  targetId: bigint("target_id", { mode: "number" })
    .notNull()
    .references(() => railNodes.id),
  corridorId: uuid("corridor_id").references(() => corridors.id),
  /** Set when the edge was created by a rail line import. */
  railLineId: uuid("rail_line_id").references(() => railLines.id),
  operator: text("operator"),
  mode: text("mode").$type<EdgeMode>().notNull().default("shortline"),
  lengthKm: doublePrecision("length_km"),
  /** Routing weights — refined over time from saved/curated routes. */
  costWeight: doublePrecision("cost_weight").notNull().default(1),
  reverseCostWeight: doublePrecision("reverse_cost_weight")
    .notNull()
    .default(1),
  geometry: geographyLineString("geometry"),
  attributes: jsonb("attributes")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
});
