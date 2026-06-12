import { describe, expect, it } from "vitest";
import { decodePolyline } from "../packages/core/src/routing/truck";

describe("decodePolyline", () => {
  it("decodes Google's documented example polyline", () => {
    // From the encoded polyline algorithm docs:
    // (38.5, -120.2), (40.7, -120.95), (43.252, -126.453)
    const coords = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
    expect(coords).toEqual([
      [-120.2, 38.5],
      [-120.95, 40.7],
      [-126.453, 43.252],
    ]);
  });

  it("decodes an empty string to no coordinates", () => {
    expect(decodePolyline("")).toEqual([]);
  });

  it("round-trips negative deltas (westward/southward travel)", () => {
    // Single point at a negative lat/lng.
    const coords = decodePolyline("~ps|U_p~iF");
    expect(coords[0][1]).toBeCloseTo(-120.2, 5);
    expect(coords[0][0]).toBeCloseTo(38.5, 5);
  });
});
