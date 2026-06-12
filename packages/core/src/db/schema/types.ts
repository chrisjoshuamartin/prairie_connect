import { sql, type SQL } from "drizzle-orm";
import { customType } from "drizzle-orm/pg-core";

/**
 * PostGIS / pgvector column types that Drizzle doesn't ship natively.
 *
 * Geography values are EWKT strings ("SRID=4326;POINT(lng lat)"). Via the RDS
 * Data API, inserts must use an explicit `::geography` cast (see
 * `geographyFromEwkt`) — plain text params are not auto-cast. Reads come back
 * as WKB hex; queries that need coordinates should select ST_AsGeoJSON(...).
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

/** Explicit cast for geography columns when inserting via the RDS Data API. */
export function geographyFromEwkt(ewkt: string): SQL {
  return sql`${ewkt}::geography`;
}
