import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { railLines, railNodes, railEdges, corridors } from "../db/schema/index";
import { geographyFromEwkt } from "../db/schema/types";
import { deleteLogoObject } from "./logos";

type Position = [number, number];

export interface NormalizedLine {
  coordinates: Position[];
  /** Feature properties from the source file (kept on the edge for provenance). */
  properties: Record<string, unknown>;
}

export class GeoJsonImportError extends Error {}

function isPosition(value: unknown): value is Position {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    value[0] >= -180 &&
    value[0] <= 180 &&
    value[1] >= -90 &&
    value[1] <= 90
  );
}

function toLine(coords: unknown, properties: Record<string, unknown>): NormalizedLine {
  if (!Array.isArray(coords) || coords.length < 2 || !coords.every(isPosition)) {
    throw new GeoJsonImportError(
      "LineString coordinates must be an array of at least 2 [lng, lat] positions",
    );
  }
  // Strip any altitude / extra ordinates.
  return {
    coordinates: coords.map((p): Position => [p[0], p[1]]),
    properties,
  };
}

function linesFromGeometry(
  geometry: Record<string, unknown>,
  properties: Record<string, unknown>,
): NormalizedLine[] {
  const type = geometry.type;
  if (type === "LineString") {
    return [toLine(geometry.coordinates, properties)];
  }
  if (type === "MultiLineString") {
    const parts = geometry.coordinates;
    if (!Array.isArray(parts) || parts.length === 0) {
      throw new GeoJsonImportError("MultiLineString has no line parts");
    }
    return parts.map((part) => toLine(part, properties));
  }
  return [];
}

/**
 * Accepts a GeoJSON FeatureCollection, Feature, LineString, or
 * MultiLineString and returns the constituent LineStrings (with their
 * feature properties). Non-line features are ignored; a file with no line
 * geometry at all is an error.
 */
export function normalizeRailGeoJson(input: unknown): NormalizedLine[] {
  if (typeof input === "string") {
    try {
      input = JSON.parse(input);
    } catch {
      throw new GeoJsonImportError("Input is not valid JSON");
    }
  }
  if (typeof input !== "object" || input === null) {
    throw new GeoJsonImportError("Input is not a GeoJSON object");
  }
  const obj = input as Record<string, unknown>;

  let lines: NormalizedLine[] = [];
  if (obj.type === "FeatureCollection") {
    const features = obj.features;
    if (!Array.isArray(features)) {
      throw new GeoJsonImportError("FeatureCollection has no features array");
    }
    for (const f of features) {
      if (typeof f !== "object" || f === null) continue;
      const feature = f as Record<string, unknown>;
      if (feature.type !== "Feature" || typeof feature.geometry !== "object" || feature.geometry === null) continue;
      const props =
        typeof feature.properties === "object" && feature.properties !== null
          ? (feature.properties as Record<string, unknown>)
          : {};
      lines.push(...linesFromGeometry(feature.geometry as Record<string, unknown>, props));
    }
  } else if (obj.type === "Feature") {
    if (typeof obj.geometry !== "object" || obj.geometry === null) {
      throw new GeoJsonImportError("Feature has no geometry");
    }
    const props =
      typeof obj.properties === "object" && obj.properties !== null
        ? (obj.properties as Record<string, unknown>)
        : {};
    lines = linesFromGeometry(obj.geometry as Record<string, unknown>, props);
  } else if (obj.type === "LineString" || obj.type === "MultiLineString") {
    lines = linesFromGeometry(obj, {});
  } else {
    throw new GeoJsonImportError(
      `Unsupported GeoJSON type "${String(obj.type)}" — expected FeatureCollection, Feature, LineString, or MultiLineString`,
    );
  }

  if (lines.length === 0) {
    throw new GeoJsonImportError(
      "No LineString or MultiLineString geometry found in the input",
    );
  }
  return lines;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 100);
}

export function ewktLineString(coords: Position[]): string {
  return `SRID=4326;LINESTRING(${coords.map(([lng, lat]) => `${lng} ${lat}`).join(",")})`;
}

export function ewktMultiLineString(lines: NormalizedLine[]): string {
  const parts = lines
    .map((l) => `(${l.coordinates.map(([lng, lat]) => `${lng} ${lat}`).join(",")})`)
    .join(",");
  return `SRID=4326;MULTILINESTRING(${parts})`;
}

function rows<T>(res: unknown): T[] {
  const r = res as { rows?: T[] };
  return (r.rows ?? (res as T[])) as T[];
}

export interface ImportRailLineInput {
  name: string;
  slug?: string;
  operator?: string;
  description?: string;
  /** Parsed GeoJSON (FeatureCollection / Feature / LineString / MultiLineString). */
  geojson: unknown;
  /** Original filename, for provenance. */
  sourceName?: string;
  /** Also derive rail_nodes / rail_edges for pgRouting (default true). */
  buildGraph?: boolean;
  /** Existing nodes within this distance of a segment endpoint are reused (default 150 m). */
  snapToleranceM?: number;
}

export interface ImportRailLineResult {
  railLineId: string;
  slug: string;
  segmentCount: number;
  nodesCreated: number;
  nodesReused: number;
  edgesCreated: number;
  totalLengthKm: number;
}

/**
 * Find-or-create a graph node for a segment endpoint. Endpoints within the
 * snap tolerance of an existing node (from this import or a previous one)
 * reuse it, which is what stitches separately imported lines into one
 * routable network at shared junctions/interchanges.
 */
async function resolveNode(
  lng: number,
  lat: number,
  railLineId: string,
  toleranceM: number,
  cache: Map<string, number>,
  counters: { created: number; reused: number },
): Promise<number> {
  const key = `${lng.toFixed(5)},${lat.toFixed(5)}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const db = getDb();
  const found = await db.execute(sql`
    SELECT id FROM rail_nodes
    WHERE ST_DWithin(location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${toleranceM})
    ORDER BY location <-> ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
    LIMIT 1
  `);
  const existing = rows<{ id: number }>(found)[0];
  if (existing) {
    counters.reused++;
    cache.set(key, Number(existing.id));
    return Number(existing.id);
  }

  const inserted = await db
    .insert(railNodes)
    .values({
      kind: "junction",
      railLineId,
      location: geographyFromEwkt(`SRID=4326;POINT(${lng} ${lat})`),
    })
    .returning({ id: railNodes.id });
  counters.created++;
  cache.set(key, inserted[0].id);
  return inserted[0].id;
}

/** Remove edges and non-shared nodes derived from a rail line import. */
export async function clearDerivedGraph(railLineId: string): Promise<void> {
  const db = getDb();
  await db.delete(railEdges).where(eq(railEdges.railLineId, railLineId));
  await db.execute(sql`
    DELETE FROM rail_nodes n
    WHERE n.rail_line_id = ${railLineId}::uuid
      AND NOT EXISTS (
        SELECT 1 FROM rail_edges e
        WHERE e.source_id = n.id OR e.target_id = n.id
      )
  `);
  await db
    .update(railNodes)
    .set({ railLineId: null })
    .where(eq(railNodes.railLineId, railLineId));
}

export interface DeriveGraphResult {
  nodesCreated: number;
  nodesReused: number;
  edgesCreated: number;
}

/** Build routing edges/nodes for an existing rail line from normalized segments. */
export async function deriveRailLineGraph(
  railLineId: string,
  lines: NormalizedLine[],
  operator: string | undefined,
  snapToleranceM = 150,
): Promise<DeriveGraphResult> {
  const db = getDb();
  const counters = { created: 0, reused: 0 };
  const cache = new Map<string, number>();
  type EdgeInsert = typeof railEdges.$inferInsert;
  const edgeValues: EdgeInsert[] = [];

  for (const seg of lines) {
    const [startLng, startLat] = seg.coordinates[0];
    const [endLng, endLat] = seg.coordinates[seg.coordinates.length - 1];
    const sourceId = await resolveNode(
      startLng,
      startLat,
      railLineId,
      snapToleranceM,
      cache,
      counters,
    );
    const targetId = await resolveNode(
      endLng,
      endLat,
      railLineId,
      snapToleranceM,
      cache,
      counters,
    );
    if (sourceId === targetId && seg.coordinates.length <= 2) continue;
    edgeValues.push({
      sourceId,
      targetId,
      railLineId,
      operator,
      mode: "shortline",
      geometry: geographyFromEwkt(
        ewktLineString(seg.coordinates),
      ) as unknown as EdgeInsert["geometry"],
      attributes: seg.properties,
    });
  }

  const CHUNK = 25;
  for (let i = 0; i < edgeValues.length; i += CHUNK) {
    await db.insert(railEdges).values(edgeValues.slice(i, i + CHUNK));
  }

  await db.execute(sql`
    UPDATE rail_edges SET length_km = ST_Length(geometry) / 1000.0
    WHERE rail_line_id = ${railLineId}::uuid AND length_km IS NULL
  `);

  return {
    nodesCreated: counters.created,
    nodesReused: counters.reused,
    edgesCreated: edgeValues.length,
  };
}

export async function totalLengthKmForRailLine(railLineId: string): Promise<number> {
  const lengthRes = await getDb().execute(sql`
    SELECT COALESCE(SUM(length_km), ST_Length((SELECT geometry FROM rail_lines WHERE id = ${railLineId}::uuid)) / 1000.0) AS total
    FROM rail_edges WHERE rail_line_id = ${railLineId}::uuid
  `);
  const total = rows<{ total: number | string | null }>(lengthRes)[0]?.total;
  return total != null ? Number(total) : 0;
}

/** Copy updated geometry onto linked corridors and re-tag their graph rows. */
export async function syncLinkedCorridors(railLineId: string): Promise<void> {
  const db = getDb();
  const linked = await db
    .select({ id: corridors.id })
    .from(corridors)
    .where(eq(corridors.railLineId, railLineId));

  for (const corridor of linked) {
    await db.execute(sql`
      UPDATE corridors
      SET geometry = (SELECT geometry FROM rail_lines WHERE id = ${railLineId}::uuid)
      WHERE id = ${corridor.id}::uuid
    `);
    await db
      .update(railEdges)
      .set({ corridorId: corridor.id })
      .where(eq(railEdges.railLineId, railLineId));
    await db
      .update(railNodes)
      .set({ corridorId: corridor.id })
      .where(eq(railNodes.railLineId, railLineId));
  }
}

/**
 * Import a rail line from GeoJSON: stores the full geometry on rail_lines
 * and (optionally) derives the pgRouting graph — one edge per source
 * LineString, with endpoints snapped onto existing nodes.
 */
export async function importRailLine(
  input: ImportRailLineInput,
): Promise<ImportRailLineResult> {
  const lines = normalizeRailGeoJson(input.geojson);
  const slug = input.slug?.trim() || slugify(input.name);
  if (!slug) {
    throw new GeoJsonImportError("Could not derive a slug from the name");
  }
  const db = getDb();

  const [line] = await db
    .insert(railLines)
    .values({
      slug,
      name: input.name,
      operator: input.operator,
      description: input.description,
      geometry: geographyFromEwkt(ewktMultiLineString(lines)),
      properties: { featureCount: lines.length },
      sourceName: input.sourceName,
    })
    .returning({ id: railLines.id, slug: railLines.slug });

  let graph: DeriveGraphResult | null = null;
  if (input.buildGraph !== false) {
    graph = await deriveRailLineGraph(
      line.id,
      lines,
      input.operator,
      input.snapToleranceM ?? 150,
    );
  }

  return {
    railLineId: line.id,
    slug: line.slug,
    segmentCount: lines.length,
    nodesCreated: graph?.nodesCreated ?? 0,
    nodesReused: graph?.nodesReused ?? 0,
    edgesCreated: graph?.edgesCreated ?? 0,
    totalLengthKm: await totalLengthKmForRailLine(line.id),
  };
}

/**
 * Remove a rail line and the graph derived from it. Nodes shared with other
 * lines' edges are kept (detached from this line); corridors built on the
 * line keep their copied geometry but lose the link.
 */
export async function deleteRailLine(id: string): Promise<boolean> {
  const db = getDb();
  const existing = await db
    .select({ id: railLines.id, logoKey: railLines.logoKey })
    .from(railLines)
    .where(eq(railLines.id, id));
  if (!existing[0]) return false;

  await db
    .update(corridors)
    .set({ railLineId: null })
    .where(eq(corridors.railLineId, id));

  await clearDerivedGraph(id);

  await db.delete(railLines).where(eq(railLines.id, id));
  await deleteLogoObject(existing[0].logoKey);
  return true;
}
