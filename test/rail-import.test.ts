import { describe, it, expect } from "vitest";
import {
  normalizeRailGeoJson,
  slugify,
  GeoJsonImportError,
} from "@prairie-connect/core/rail/import";

const lineString = {
  type: "LineString",
  coordinates: [
    [-106.6, 52.1],
    [-106.5, 52.2],
  ],
};

describe("normalizeRailGeoJson", () => {
  it("accepts a bare LineString", () => {
    const lines = normalizeRailGeoJson(lineString);
    expect(lines).toHaveLength(1);
    expect(lines[0].coordinates).toEqual([
      [-106.6, 52.1],
      [-106.5, 52.2],
    ]);
    expect(lines[0].properties).toEqual({});
  });

  it("splits a MultiLineString into one line per part", () => {
    const lines = normalizeRailGeoJson({
      type: "MultiLineString",
      coordinates: [
        [
          [-106.6, 52.1],
          [-106.5, 52.2],
        ],
        [
          [-106.5, 52.2],
          [-106.4, 52.3],
        ],
      ],
    });
    expect(lines).toHaveLength(2);
  });

  it("keeps feature properties on each line", () => {
    const lines = normalizeRailGeoJson({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { subdivision: "Main", trackType: "Main Track" },
          geometry: lineString,
        },
      ],
    });
    expect(lines[0].properties).toEqual({
      subdivision: "Main",
      trackType: "Main Track",
    });
  });

  it("ignores non-line features but keeps line ones", () => {
    const lines = normalizeRailGeoJson({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: { type: "Point", coordinates: [-106.6, 52.1] },
        },
        { type: "Feature", properties: {}, geometry: lineString },
      ],
    });
    expect(lines).toHaveLength(1);
  });

  it("strips altitude ordinates", () => {
    const lines = normalizeRailGeoJson({
      type: "LineString",
      coordinates: [
        [-106.6, 52.1, 480],
        [-106.5, 52.2, 482],
      ],
    });
    expect(lines[0].coordinates[0]).toEqual([-106.6, 52.1]);
  });

  it("accepts a JSON string", () => {
    const lines = normalizeRailGeoJson(JSON.stringify(lineString));
    expect(lines).toHaveLength(1);
  });

  it("rejects input with no line geometry", () => {
    expect(() =>
      normalizeRailGeoJson({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: { type: "Point", coordinates: [0, 0] },
          },
        ],
      }),
    ).toThrow(GeoJsonImportError);
  });

  it("rejects out-of-range coordinates", () => {
    expect(() =>
      normalizeRailGeoJson({
        type: "LineString",
        coordinates: [
          [-200, 52.1],
          [-106.5, 52.2],
        ],
      }),
    ).toThrow(GeoJsonImportError);
  });

  it("rejects single-position lines", () => {
    expect(() =>
      normalizeRailGeoJson({ type: "LineString", coordinates: [[-106.6, 52.1]] }),
    ).toThrow(GeoJsonImportError);
  });

  it("rejects unsupported GeoJSON types", () => {
    expect(() =>
      normalizeRailGeoJson({ type: "Polygon", coordinates: [] }),
    ).toThrow(/Unsupported GeoJSON type/);
  });

  it("rejects invalid JSON strings", () => {
    expect(() => normalizeRailGeoJson("not json")).toThrow(GeoJsonImportError);
  });
});

describe("slugify", () => {
  it("derives url-safe slugs", () => {
    expect(slugify("Great Western Railway")).toBe("great-western-railway");
    expect(slugify("  Big Sky / Rail Link! ")).toBe("big-sky-rail-link");
    expect(slugify("Côté Rail")).toBe("cote-rail");
  });
});
