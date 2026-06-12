import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { railLines, railEdges } from "../db/schema/index";
import { geographyFromEwkt } from "../db/schema/types";
import {
  normalizeRailGeoJson,
  clearDerivedGraph,
  deriveRailLineGraph,
  syncLinkedCorridors,
  totalLengthKmForRailLine,
  ewktMultiLineString,
  GeoJsonImportError,
  type DeriveGraphResult,
} from "./import";

export interface UpdateRailLineInput {
  name?: string;
  slug?: string;
  operator?: string | null;
  description?: string | null;
  geojson?: unknown;
  sourceName?: string;
  rebuildGraph?: boolean;
  snapToleranceM?: number;
}

export interface UpdateRailLineResult {
  id: string;
  slug: string;
  name: string;
  operator: string | null;
  description: string | null;
  geometryUpdated: boolean;
  graphRebuilt: (DeriveGraphResult & {
    segmentCount: number;
    totalLengthKm: number;
  }) | null;
}

export async function updateRailLine(
  id: string,
  input: UpdateRailLineInput,
): Promise<UpdateRailLineResult | null> {
  const db = getDb();
  const [existing] = await db.select().from(railLines).where(eq(railLines.id, id));
  if (!existing) return null;

  const set: Partial<typeof railLines.$inferInsert> = {};
  if (input.name !== undefined) set.name = input.name;
  if (input.slug !== undefined) set.slug = input.slug;
  if (input.operator !== undefined) set.operator = input.operator;
  if (input.description !== undefined) set.description = input.description;

  let lines = null as ReturnType<typeof normalizeRailGeoJson> | null;
  let geometryUpdated = false;
  let graphRebuilt: UpdateRailLineResult["graphRebuilt"] = null;

  if (input.geojson !== undefined) {
    lines = normalizeRailGeoJson(input.geojson);
    set.geometry = geographyFromEwkt(
      ewktMultiLineString(lines),
    ) as unknown as (typeof railLines.$inferInsert)["geometry"];
    set.properties = { featureCount: lines.length };
    if (input.sourceName !== undefined) set.sourceName = input.sourceName;
    geometryUpdated = true;
  }

  if (Object.keys(set).length > 0) {
    await db.update(railLines).set(set).where(eq(railLines.id, id));
  }

  if (geometryUpdated && lines) {
    if (input.rebuildGraph !== false) {
      await clearDerivedGraph(id);
      const graph = await deriveRailLineGraph(
        id,
        lines,
        input.operator ?? existing.operator ?? undefined,
        input.snapToleranceM ?? 150,
      );
      graphRebuilt = {
        ...graph,
        segmentCount: lines.length,
        totalLengthKm: await totalLengthKmForRailLine(id),
      };
    }

    await syncLinkedCorridors(id);
  } else if (input.operator !== undefined) {
    await db
      .update(railEdges)
      .set({ operator: input.operator })
      .where(eq(railEdges.railLineId, id));
  }

  const [row] = await db.select().from(railLines).where(eq(railLines.id, id));
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    operator: row.operator,
    description: row.description,
    geometryUpdated,
    graphRebuilt,
  };
}

export { GeoJsonImportError };
