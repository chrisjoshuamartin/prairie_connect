import { sql, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { railLines, railNodes, railEdges } from "../db/schema/index";
import { geographyFromEwkt } from "../db/schema/types";
import {
  normalizeRailGeoJson,
  slugify,
  deleteRailLine,
  ewktLineString,
  type NormalizedLine,
} from "./import";

/**
 * Bulk importer for national track datasets (NRWN provincial GeoJSON).
 *
 * Differs from the single-line admin import in two ways that matter at
 * ~10k-feature scale over the RDS Data API:
 *   - node snapping happens in memory (spatial-hash grid) instead of two
 *     queries per segment endpoint;
 *   - nodes and edges are bulk-inserted in batches.
 *
 * Features are filtered to the routable network (Operational status,
 * Main / Connecting / Wye classification — yards, spurs, and sidings are
 * noise for corridor-level routing) and grouped into one rail_lines row
 * per operator + province.
 */

const ROUTABLE_CLASSIFICATIONS = new Set(["Main", "Connecting", "Wye"]);
const CLASS1_PATTERN = /canadian national|canadian pacific|burlington northern|union pacific|bnsf/i;

export interface ImportTrackNetworkInput {
  /** Parsed GeoJSON FeatureCollection (NRWN provincial extract). */
  geojson: unknown;
  /** Original filename, for provenance. */
  sourceName: string;
  /** Endpoints within this distance reuse a node (default 150 m). */
  snapToleranceM?: number;
  /** Re-import groups whose rail line already exists (default: skip them). */
  replace?: boolean;
  /** Used when a feature has no administrativeAreaCode. */
  defaultProvince?: string;
}

export interface ImportedGroup {
  slug: string;
  name: string;
  operator: string;
  province: string;
  status: "imported" | "replaced" | "skipped";
  segmentCount: number;
  nodesCreated: number;
  nodesReused: number;
  edgesCreated: number;
  totalLengthKm: number;
}

export interface ImportTrackNetworkResult {
  groups: ImportedGroup[];
  featureCount: number;
  routableCount: number;
}

interface RegistryNode {
  lng: number;
  lat: number;
  /** Assigned after DB insert; pre-existing nodes have it immediately. */
  id?: number;
}

/** Spatial-hash registry: snaps endpoints within toleranceM of each other. */
class NodeRegistry {
  private grid = new Map<string, RegistryNode[]>();
  private readonly latCell: number;
  private readonly lngCell: number;

  constructor(private toleranceM: number) {
    // Slightly oversized cells guarantee a ±1-cell neighborhood always
    // covers the snap radius (lng cell sized for latitudes up to 60°).
    this.latCell = toleranceM / 110000;
    this.lngCell = toleranceM / 55000;
  }

  private key(cx: number, cy: number): string {
    return `${cx}:${cy}`;
  }

  find(lng: number, lat: number): RegistryNode | null {
    const cx = Math.floor(lng / this.lngCell);
    const cy = Math.floor(lat / this.latCell);
    let best: RegistryNode | null = null;
    let bestDist = Infinity;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = this.grid.get(this.key(cx + dx, cy + dy));
        if (!bucket) continue;
        for (const node of bucket) {
          const d = haversineM(lng, lat, node.lng, node.lat);
          if (d <= this.toleranceM && d < bestDist) {
            best = node;
            bestDist = d;
          }
        }
      }
    }
    return best;
  }

  add(node: RegistryNode): void {
    const cx = Math.floor(node.lng / this.lngCell);
    const cy = Math.floor(node.lat / this.latCell);
    const k = this.key(cx, cy);
    const bucket = this.grid.get(k);
    if (bucket) bucket.push(node);
    else this.grid.set(k, [node]);
  }
}

function haversineM(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const R = 6371000;
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLng = (lng2 - lng1) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function rows<T>(res: unknown): T[] {
  const r = res as { rows?: T[] };
  return (r.rows ?? (res as T[])) as T[];
}

function prop(props: Record<string, unknown>, key: string): string | undefined {
  const v = props[key];
  return typeof v === "string" && v !== "None" && v !== "Unknown" ? v : undefined;
}

function isRoutable(props: Record<string, unknown>): boolean {
  const status = props.status;
  const classification = props.trackClassification;
  return (
    (status === undefined || status === "Operational") &&
    typeof classification === "string" &&
    ROUTABLE_CLASSIFICATIONS.has(classification)
  );
}

/** Trimmed provenance kept on each edge (full NRWN props are bulky). */
function edgeAttributes(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of [
    "trackName",
    "trackClassification",
    "subdivision1Name",
    "operatorEnglishName",
    "numberOfTracks",
  ]) {
    if (props[key] !== undefined && props[key] !== "None") out[key] = props[key];
  }
  return out;
}

async function loadExistingNodes(registry: NodeRegistry): Promise<number> {
  const res = await getDb().execute(sql`
    SELECT id, ST_X(location::geometry) AS lng, ST_Y(location::geometry) AS lat
    FROM rail_nodes
  `);
  const existing = rows<{ id: number; lng: number; lat: number }>(res);
  for (const n of existing) {
    registry.add({ id: Number(n.id), lng: Number(n.lng), lat: Number(n.lat) });
  }
  return existing.length;
}

interface PendingEdge {
  source: RegistryNode;
  target: RegistryNode;
  ewkt: string;
  attributes: Record<string, unknown>;
}

async function importGroup(
  operator: string,
  province: string,
  segments: NormalizedLine[],
  sourceName: string,
  registry: NodeRegistry,
): Promise<Omit<ImportedGroup, "slug" | "name" | "operator" | "province" | "status">> {
  const db = getDb();
  const name = `${operator} (${province})`;
  const slug = `nrwn-${slugify(operator)}-${province.toLowerCase()}`;
  const mode = CLASS1_PATTERN.test(operator) ? "class1" : "shortline";

  const [line] = await db
    .insert(railLines)
    .values({
      slug,
      name,
      operator,
      description: `Imported from the national track reference (${sourceName}); main/connecting trackage only.`,
      geometry: geographyFromEwkt("SRID=4326;MULTILINESTRING EMPTY"),
      properties: { featureCount: segments.length, source: "NRWN", province },
      sourceName,
    })
    .returning({ id: railLines.id });
  const railLineId = line.id;

  // Resolve endpoints against the in-memory registry; new nodes get DB ids
  // after the bulk insert below.
  let nodesReused = 0;
  const newNodes: RegistryNode[] = [];
  const resolve = (lng: number, lat: number): RegistryNode => {
    const found = registry.find(lng, lat);
    if (found) {
      nodesReused++;
      return found;
    }
    const node: RegistryNode = { lng, lat };
    registry.add(node);
    newNodes.push(node);
    return node;
  };

  const pendingEdges: PendingEdge[] = [];
  for (const seg of segments) {
    const [startLng, startLat] = seg.coordinates[0];
    const [endLng, endLat] = seg.coordinates[seg.coordinates.length - 1];
    const source = resolve(startLng, startLat);
    const target = resolve(endLng, endLat);
    if (source === target && seg.coordinates.length <= 2) continue;
    pendingEdges.push({
      source,
      target,
      ewkt: ewktLineString(seg.coordinates),
      attributes: edgeAttributes(seg.properties),
    });
  }

  // Bulk-insert new nodes; RETURNING preserves VALUES order in Postgres.
  const NODE_CHUNK = 100;
  for (let i = 0; i < newNodes.length; i += NODE_CHUNK) {
    const chunk = newNodes.slice(i, i + NODE_CHUNK);
    const inserted = await db
      .insert(railNodes)
      .values(
        chunk.map((n) => ({
          kind: "junction" as const,
          railLineId,
          location: geographyFromEwkt(`SRID=4326;POINT(${n.lng} ${n.lat})`),
        })),
      )
      .returning({ id: railNodes.id });
    chunk.forEach((n, j) => {
      n.id = inserted[j].id;
    });
  }

  // Bulk-insert edges, flushing on row count or accumulated geometry size
  // (Data API requests cap out around 512 KB).
  type EdgeInsert = typeof railEdges.$inferInsert;
  const EDGE_CHUNK = 25;
  const MAX_CHUNK_CHARS = 150_000;
  let batch: EdgeInsert[] = [];
  let batchChars = 0;
  const flush = async () => {
    if (batch.length === 0) return;
    await db.insert(railEdges).values(batch);
    batch = [];
    batchChars = 0;
  };
  for (const edge of pendingEdges) {
    batch.push({
      sourceId: edge.source.id!,
      targetId: edge.target.id!,
      railLineId,
      operator,
      mode,
      geometry: geographyFromEwkt(edge.ewkt) as unknown as EdgeInsert["geometry"],
      attributes: edge.attributes,
    });
    batchChars += edge.ewkt.length;
    if (batch.length >= EDGE_CHUNK || batchChars >= MAX_CHUNK_CHARS) await flush();
  }
  await flush();

  // Distance-based costs so Dijkstra minimizes kilometres, not hop count.
  await db.execute(sql`
    UPDATE rail_edges SET length_km = ST_Length(geometry) / 1000.0
    WHERE rail_line_id = ${railLineId}::uuid AND length_km IS NULL
  `);
  await db.execute(sql`
    UPDATE rail_edges
    SET cost_weight = GREATEST(length_km, 0.001),
        reverse_cost_weight = GREATEST(length_km, 0.001)
    WHERE rail_line_id = ${railLineId}::uuid
  `);

  // The line geometry is aggregated from its edges in the database instead
  // of being sent as one (multi-megabyte) EWKT parameter.
  await db.execute(sql`
    UPDATE rail_lines
    SET geometry = (
      SELECT ST_Multi(ST_Collect(geometry::geometry))::geography
      FROM rail_edges WHERE rail_line_id = ${railLineId}::uuid
    )
    WHERE id = ${railLineId}::uuid
  `);

  const lengthRes = await db.execute(sql`
    SELECT COALESCE(SUM(length_km), 0) AS total
    FROM rail_edges WHERE rail_line_id = ${railLineId}::uuid
  `);
  const totalLengthKm = Number(rows<{ total: number | string }>(lengthRes)[0]?.total ?? 0);

  return {
    segmentCount: segments.length,
    nodesCreated: newNodes.length,
    nodesReused,
    edgesCreated: pendingEdges.length,
    totalLengthKm,
  };
}

export async function importTrackNetwork(
  input: ImportTrackNetworkInput,
): Promise<ImportTrackNetworkResult> {
  const db = getDb();
  const toleranceM = input.snapToleranceM ?? 150;
  const allLines = normalizeRailGeoJson(input.geojson);
  const routable = allLines.filter((l) => isRoutable(l.properties));

  // Group routable segments by operator + province.
  const groups = new Map<string, { operator: string; province: string; segments: NormalizedLine[] }>();
  for (const seg of routable) {
    const operator = prop(seg.properties, "operatorEnglishName") ?? "Unknown operator";
    const province =
      prop(seg.properties, "administrativeAreaCode") ?? input.defaultProvince ?? "XX";
    const key = `${operator}|${province}`;
    const group = groups.get(key);
    if (group) group.segments.push(seg);
    else groups.set(key, { operator, province, segments: [seg] });
  }

  const results: ImportedGroup[] = [];
  const toImport: { operator: string; province: string; segments: NormalizedLine[]; replaced: boolean }[] = [];

  // Handle pre-existing lines first so deletions happen before the node
  // registry snapshot is taken.
  for (const { operator, province, segments } of groups.values()) {
    const slug = `nrwn-${slugify(operator)}-${province.toLowerCase()}`;
    const name = `${operator} (${province})`;
    const [existing] = await db
      .select({ id: railLines.id })
      .from(railLines)
      .where(eq(railLines.slug, slug));
    if (existing && !input.replace) {
      results.push({
        slug,
        name,
        operator,
        province,
        status: "skipped",
        segmentCount: segments.length,
        nodesCreated: 0,
        nodesReused: 0,
        edgesCreated: 0,
        totalLengthKm: 0,
      });
      continue;
    }
    if (existing) await deleteRailLine(existing.id);
    toImport.push({ operator, province, segments, replaced: Boolean(existing) });
  }

  if (toImport.length > 0) {
    const registry = new NodeRegistry(toleranceM);
    await loadExistingNodes(registry);

    for (const { operator, province, segments, replaced } of toImport) {
      const stats = await importGroup(
        operator,
        province,
        segments,
        input.sourceName,
        registry,
      );
      results.push({
        slug: `nrwn-${slugify(operator)}-${province.toLowerCase()}`,
        name: `${operator} (${province})`,
        operator,
        province,
        status: replaced ? "replaced" : "imported",
        ...stats,
      });
    }
  }

  return {
    groups: results.sort((a, b) => b.edgesCreated - a.edgesCreated),
    featureCount: allLines.length,
    routableCount: routable.length,
  };
}
