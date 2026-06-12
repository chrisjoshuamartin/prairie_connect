import { sql } from "drizzle-orm";
import { getDb } from "../db/client";
import type { RouteSegment } from "../db/schema/routes";

function rows<T>(res: unknown): T[] {
  const r = res as { rows?: T[] };
  return (r.rows ?? (res as T[])) as T[];
}

export interface RoutingOptions {
  /**
   * Allow yard / spur / siding / crossover trackage as connectors
   * (default true). They carry a cost multiplier so they stitch junctions
   * together without becoming through-routes; disabling them restricts
   * routing to Main / Connecting / Wye trackage.
   */
  useYardConnectors?: boolean;
  /** Cost multiplier for connector trackage (default 5). */
  yardCostFactor?: number;
  /**
   * Operator whose edges are preferred: every other operator's edges cost
   * `operatorPenaltyFactor` times more, approximating the real cost of
   * interchanging between railways.
   */
  preferOperator?: string;
  /** Cost multiplier for non-preferred operators (default 2). */
  operatorPenaltyFactor?: number;
}

export interface FindRouteInput {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  /** Reverse routing (site -> markets) uses the reverse cost weights. */
  reverse?: boolean;
  options?: RoutingOptions;
}

const CONNECTOR_CLASSIFICATIONS = ["Yard", "Spur", "Siding", "Crossover"];

/**
 * pgRouting takes its edge set as a SQL string, so the routing options are
 * baked into that inner query here. Values are clamped numbers / escaped
 * literals — the string is passed to pgr_dijkstra as a bound parameter.
 */
function buildEdgesSql(options: RoutingOptions = {}): string {
  const yardFactor = Math.min(Math.max(options.yardCostFactor ?? 5, 1), 100);
  const operatorFactor = Math.min(
    Math.max(options.operatorPenaltyFactor ?? 2, 1),
    100,
  );
  const connectorList = CONNECTOR_CLASSIFICATIONS.map((c) => `'${c}'`).join(", ");
  const isConnector = `COALESCE(attributes->>'trackClassification', '') IN (${connectorList})`;

  const factors: string[] = [];
  if (options.useYardConnectors !== false) {
    factors.push(`(CASE WHEN ${isConnector} THEN ${yardFactor} ELSE 1 END)`);
  }
  if (options.preferOperator) {
    const escaped = options.preferOperator.replace(/'/g, "''");
    factors.push(
      `(CASE WHEN operator IS DISTINCT FROM '${escaped}' THEN ${operatorFactor} ELSE 1 END)`,
    );
  }
  const mult = factors.length > 0 ? ` * ${factors.join(" * ")}` : "";
  const where =
    options.useYardConnectors === false ? ` WHERE NOT (${isConnector})` : "";

  return (
    `SELECT id, source_id AS source, target_id AS target, ` +
    `cost_weight${mult} AS cost, reverse_cost_weight${mult} AS reverse_cost ` +
    `FROM rail_edges${where}`
  );
}

export interface FindRouteResult {
  segments: RouteSegment[];
  totalLengthKm: number;
  /** GeoJSON FeatureCollection of the edge geometries, ready for the map. */
  geometry: {
    type: "FeatureCollection";
    features: Record<string, unknown>[];
  };
  nearestOriginNode: { id: number; name: string | null; distanceKm: number };
  nearestDestinationNode: { id: number; name: string | null; distanceKm: number };
}

interface NearestNodeRow {
  id: number;
  name: string | null;
  distance_km: number;
}

async function nearestNode(lat: number, lng: number): Promise<NearestNodeRow | null> {
  const res = await getDb().execute(sql`
    SELECT id, name,
      ST_Distance(location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography) / 1000.0 AS distance_km
    FROM rail_nodes
    ORDER BY location <-> ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
    LIMIT 1
  `);
  return rows<NearestNodeRow>(res)[0] ?? null;
}

interface PathRow {
  seq: number;
  node: number;
  edge: number;
  edge_id: number | null;
  mode: string | null;
  operator: string | null;
  length_km: number | null;
  source_id: number | null;
  target_id: number | null;
  source_name: string | null;
  target_name: string | null;
  geojson: string | null;
}

/**
 * Shortest path over the rail network graph with pgr_dijkstra. The inner
 * SQL string is pgRouting's required "edges SQL" — it runs inside Postgres
 * and only references the rail_edges table.
 */
export async function findRoute(input: FindRouteInput): Promise<FindRouteResult | null> {
  const [originNode, destNode] = await Promise.all([
    nearestNode(input.origin.lat, input.origin.lng),
    nearestNode(input.destination.lat, input.destination.lng),
  ]);
  if (!originNode || !destNode) return null;

  const [startId, endId] = input.reverse
    ? [destNode.id, originNode.id]
    : [originNode.id, destNode.id];

  const edgesSql = buildEdgesSql(input.options);
  const res = await getDb().execute(sql`
    SELECT p.seq, p.node, p.edge,
      e.id AS edge_id, e.mode, e.operator, e.length_km,
      e.source_id, e.target_id,
      sn.name AS source_name, tn.name AS target_name,
      ST_AsGeoJSON(e.geometry) AS geojson
    FROM pgr_dijkstra(
      ${edgesSql},
      ${startId}::bigint, ${endId}::bigint, directed := true
    ) p
    LEFT JOIN rail_edges e ON e.id = p.edge
    LEFT JOIN rail_nodes sn ON sn.id = e.source_id
    LEFT JOIN rail_nodes tn ON tn.id = e.target_id
    ORDER BY p.seq
  `);

  const pathRows = rows<PathRow>(res).filter((r) => r.edge_id != null);
  if (pathRows.length === 0) return null;

  const segments: RouteSegment[] = pathRows.map((r, i) => ({
    seq: i + 1,
    edgeId: r.edge_id,
    mode: r.mode ?? "shortline",
    operator: r.operator,
    fromNode: { id: r.source_id!, name: r.source_name },
    toNode: { id: r.target_id!, name: r.target_name },
    lengthKm: r.length_km != null ? Number(r.length_km) : null,
  }));

  const features = pathRows
    .filter((r) => r.geojson)
    .map((r) => ({
      type: "Feature",
      geometry: JSON.parse(r.geojson!),
      properties: {
        edgeId: r.edge_id,
        mode: r.mode,
        operator: r.operator,
        lengthKm: r.length_km,
      },
    }));

  return {
    segments,
    totalLengthKm: segments.reduce((sum, s) => sum + (s.lengthKm ?? 0), 0),
    geometry: { type: "FeatureCollection", features },
    nearestOriginNode: {
      id: originNode.id,
      name: originNode.name,
      distanceKm: Number(originNode.distance_km),
    },
    nearestDestinationNode: {
      id: destNode.id,
      name: destNode.name,
      distanceKm: Number(destNode.distance_km),
    },
  };
}
