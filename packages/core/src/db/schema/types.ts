import { customType } from "drizzle-orm/pg-core";

/**
 * PostGIS / pgvector column types that Drizzle doesn't ship natively.
 *
 * Geography values are written as EWKT strings ("SRID=4326;POINT(lng lat)")
 * — Postgres casts text to geography implicitly. Reads come back as WKB hex;
 * queries that need coordinates should select ST_AsGeoJSON(...) explicitly.
 */
export const geographyPoint = customType<{ data: string }>({
  dataType() {
    return "geography(Point,4326)";
  },
});

export const geographyLineString = customType<{ data: string }>({
  dataType() {
    return "geography(LineString,4326)";
  },
});

export const geographyMultiLineString = customType<{ data: string }>({
  dataType() {
    return "geography(MultiLineString,4326)";
  },
});

/** 1024 dims = amazon.titan-embed-text-v2:0 output size. */
export const vector1024 = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return "vector(1024)";
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string): number[] {
    return JSON.parse(value);
  },
});

export function ewktPoint(lng: number, lat: number): string {
  return `SRID=4326;POINT(${lng} ${lat})`;
}
