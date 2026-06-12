export interface ParsedGeoJson {
  text: string;
  parsed: Record<string, unknown>;
  sourceName: string;
  lineFeatureCount: number;
}

export function countLineFeatures(geojson: Record<string, unknown>): number {
  if (geojson.type === "FeatureCollection" && Array.isArray(geojson.features)) {
    return geojson.features.filter((f: { geometry?: { type?: string } }) =>
      ["LineString", "MultiLineString"].includes(f?.geometry?.type ?? ""),
    ).length;
  }
  if (
    geojson.type === "Feature" ||
    geojson.type === "LineString" ||
    geojson.type === "MultiLineString"
  ) {
    return 1;
  }
  return 0;
}

export function parseGeoJsonInput(
  text: string,
  sourceName: string,
): { ok: true; data: ParsedGeoJson } | { ok: false; error: string } {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, error: "GeoJSON is empty" };
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: "Not valid JSON" };
  }
  const lineFeatureCount = countLineFeatures(parsed);
  if (lineFeatureCount === 0) {
    return {
      ok: false,
      error: "No LineString / MultiLineString geometry found",
    };
  }
  return {
    ok: true,
    data: { text: trimmed, parsed, sourceName, lineFeatureCount },
  };
}
