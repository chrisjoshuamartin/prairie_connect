import { sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { findRoute, type FindRouteResult } from "./pathfind";

/**
 * Multimodal route planning prototype: truck the load from the origin to
 * the nearest rail-served site (transload / terminal), move it by rail to
 * the site nearest the destination (which may be a port), then truck the
 * final leg.
 *
 * Truck legs are straight lines scaled by a road-circuity factor — good
 * enough to demo the concept without a road network.
 */

const ROAD_CIRCUITY_FACTOR = 1.3;

export interface PlanRouteInput {
  origin: { lat: number; lng: number; label?: string };
  destination: { lat: number; lng: number; label?: string };
}

export interface PlanSite {
  id: string;
  name: string;
  slug: string;
  listingType: string;
  city: string | null;
  province: string | null;
  lat: number;
  lng: number;
}

export interface PlanLeg {
  seq: number;
  mode: "truck" | "rail";
  from: { label: string; lat: number; lng: number };
  to: { label: string; lat: number; lng: number };
  distanceKm: number;
  /** Rail legs carry the pgRouting segments (operator, edge ids, ...). */
  railDetail?: {
    segments: FindRouteResult["segments"];
    nearestOriginNode: FindRouteResult["nearestOriginNode"];
    nearestDestinationNode: FindRouteResult["nearestDestinationNode"];
  };
}

export interface PlanRouteResult {
  legs: PlanLeg[];
  originSite: PlanSite;
  destinationSite: PlanSite;
  totalDistanceKm: number;
  truckDistanceKm: number;
  railDistanceKm: number;
  /** Everything on one map: truck + rail features tagged with `mode`. */
  geometry: { type: "FeatureCollection"; features: Record<string, unknown>[] };
}

export type PlanRouteFailure =
  | { reason: "no-sites"; message: string }
  | { reason: "same-site"; message: string }
  | { reason: "no-rail-path"; message: string };

function rows<T>(res: unknown): T[] {
  const r = res as { rows?: T[] };
  return (r.rows ?? (res as T[])) as T[];
}

interface SiteRow {
  id: string;
  name: string;
  slug: string;
  listing_type: string;
  city: string | null;
  province: string | null;
  lat: number;
  lng: number;
  distance_km: number;
}

async function nearestRailServedSite(
  lat: number,
  lng: number,
  excludeId?: string,
): Promise<(PlanSite & { distanceKm: number }) | null> {
  const res = await getDb().execute(sql`
    SELECT id, name, slug, listing_type, city, province,
      ST_Y(location::geometry) AS lat,
      ST_X(location::geometry) AS lng,
      ST_Distance(location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography) / 1000.0 AS distance_km
    FROM directory_listings
    WHERE status = 'published'
      AND location IS NOT NULL
      AND listing_type IN ('transload', 'terminal', 'port')
      AND (${excludeId ?? null}::uuid IS NULL OR id != ${excludeId ?? null}::uuid)
    ORDER BY location <-> ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
    LIMIT 1
  `);
  const row = rows<SiteRow>(res)[0];
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    listingType: row.listing_type,
    city: row.city,
    province: row.province,
    lat: Number(row.lat),
    lng: Number(row.lng),
    distanceKm: Number(row.distance_km),
  };
}

function truckFeature(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  distanceKm: number,
  label: string,
): Record<string, unknown> {
  return {
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: [
        [from.lng, from.lat],
        [to.lng, to.lat],
      ],
    },
    properties: { mode: "truck", label, lengthKm: distanceKm },
  };
}

export async function planMultimodalRoute(
  input: PlanRouteInput,
): Promise<{ ok: true; plan: PlanRouteResult } | { ok: false; failure: PlanRouteFailure }> {
  const originLabel = input.origin.label ?? "Origin";
  const destinationLabel = input.destination.label ?? "Destination";

  const originSite = await nearestRailServedSite(input.origin.lat, input.origin.lng);
  if (!originSite) {
    return {
      ok: false,
      failure: {
        reason: "no-sites",
        message:
          "No published rail-served sites (transload / terminal / port) with a location exist yet",
      },
    };
  }

  const destinationSite = await nearestRailServedSite(
    input.destination.lat,
    input.destination.lng,
    originSite.id,
  );
  if (!destinationSite) {
    return {
      ok: false,
      failure: {
        reason: "same-site",
        message:
          "Origin and destination resolve to the same site — at least two located rail-served sites are needed",
      },
    };
  }

  const rail = await findRoute({
    origin: { lat: originSite.lat, lng: originSite.lng },
    destination: { lat: destinationSite.lat, lng: destinationSite.lng },
  });
  if (!rail) {
    return {
      ok: false,
      failure: {
        reason: "no-rail-path",
        message: `No rail path found between ${originSite.name} and ${destinationSite.name} — is the track network imported?`,
      },
    };
  }

  const firstMileKm = originSite.distanceKm * ROAD_CIRCUITY_FACTOR;
  const lastMileKm = destinationSite.distanceKm * ROAD_CIRCUITY_FACTOR;

  const legs: PlanLeg[] = [
    {
      seq: 1,
      mode: "truck",
      from: { label: originLabel, lat: input.origin.lat, lng: input.origin.lng },
      to: { label: originSite.name, lat: originSite.lat, lng: originSite.lng },
      distanceKm: firstMileKm,
    },
    {
      seq: 2,
      mode: "rail",
      from: { label: originSite.name, lat: originSite.lat, lng: originSite.lng },
      to: {
        label: destinationSite.name,
        lat: destinationSite.lat,
        lng: destinationSite.lng,
      },
      distanceKm: rail.totalLengthKm,
      railDetail: {
        segments: rail.segments,
        nearestOriginNode: rail.nearestOriginNode,
        nearestDestinationNode: rail.nearestDestinationNode,
      },
    },
    {
      seq: 3,
      mode: "truck",
      from: {
        label: destinationSite.name,
        lat: destinationSite.lat,
        lng: destinationSite.lng,
      },
      to: {
        label: destinationLabel,
        lat: input.destination.lat,
        lng: input.destination.lng,
      },
      distanceKm: lastMileKm,
    },
  ];

  const features: Record<string, unknown>[] = [
    truckFeature(input.origin, originSite, firstMileKm, `${originLabel} → ${originSite.name}`),
    ...rail.geometry.features,
    truckFeature(
      destinationSite,
      input.destination,
      lastMileKm,
      `${destinationSite.name} → ${destinationLabel}`,
    ),
  ];

  const truckDistanceKm = firstMileKm + lastMileKm;
  const { distanceKm: _o, ...originSitePlain } = originSite;
  const { distanceKm: _d, ...destinationSitePlain } = destinationSite;

  return {
    ok: true,
    plan: {
      legs,
      originSite: originSitePlain,
      destinationSite: destinationSitePlain,
      totalDistanceKm: truckDistanceKm + rail.totalLengthKm,
      truckDistanceKm,
      railDistanceKm: rail.totalLengthKm,
      geometry: { type: "FeatureCollection", features },
    },
  };
}
