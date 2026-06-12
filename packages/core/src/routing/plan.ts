import { sql } from "drizzle-orm";
import { getDb } from "../db/client";
import {
  findRoute,
  type FindRouteResult,
  type RoutingOptions,
} from "./pathfind";
import { getTruckRoute } from "./truck";

/**
 * Multimodal route planning prototype: truck the load from the origin to
 * a nearby rail-served site (transload / terminal), move it by rail to a
 * site near the destination (which may be a port), then truck the final
 * leg.
 *
 * Site pairs are chosen by minimizing a cost-weighted distance
 * (truck km × truckCostFactor + rail km) since trucking is several times
 * more expensive per km than rail. The winning plan's truck legs are then
 * routed on real roads via Google when GOOGLE_MAPS_API_KEY is set,
 * falling back to straight lines scaled by a circuity factor.
 */

const ROAD_CIRCUITY_FACTOR = 1.3;
const MAX_SITE_CANDIDATES = 3;

export interface PlanOptions extends RoutingOptions {
  /**
   * Penalize edges from railways other than the one serving the origin
   * site, so routes avoid unrealistic operator-hopping (default false).
   * Overridden by an explicit `preferOperator`.
   */
  preferSingleOperator?: boolean;
  /**
   * How many candidate sites to consider per endpoint (1-3, default 1).
   * All pairs are evaluated and the cheapest door-to-door plan wins —
   * the nearest site isn't always the best one overall.
   */
  siteCandidates?: number;
  /**
   * How much more a truck-km costs than a rail-km when scoring site
   * pairs (default 3). Higher values bias plans toward longer rail and
   * shorter drayage.
   */
  truckCostFactor?: number;
}

export interface PlanRouteInput {
  origin: { lat: number; lng: number; label?: string };
  destination: { lat: number; lng: number; label?: string };
  options?: PlanOptions;
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
  /** Truck legs: "road" = Google Directions, "estimate" = straight line. */
  source?: "road" | "estimate";
  /** Truck legs routed on roads carry the drive time. */
  durationMinutes?: number | null;
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
  /** Operator the rail leg was biased toward, when preferSingleOperator is on. */
  preferredOperator: string | null;
  /** Site pairs evaluated (siteCandidates² minus same-site pairs). */
  evaluatedPairs: number;
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

type CandidateSite = PlanSite & { distanceKm: number };

async function nearestRailServedSites(
  lat: number,
  lng: number,
  limit: number,
): Promise<CandidateSite[]> {
  const res = await getDb().execute(sql`
    SELECT id, name, slug, listing_type, city, province,
      ST_Y(location::geometry) AS lat,
      ST_X(location::geometry) AS lng,
      ST_Distance(location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography) / 1000.0 AS distance_km
    FROM directory_listings
    WHERE status = 'published'
      AND location IS NOT NULL
      AND listing_type IN ('transload', 'terminal', 'port')
    ORDER BY location <-> ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
    LIMIT ${limit}
  `);
  return rows<SiteRow>(res).map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    listingType: row.listing_type,
    city: row.city,
    province: row.province,
    lat: Number(row.lat),
    lng: Number(row.lng),
    distanceKm: Number(row.distance_km),
  }));
}

/** The railway serving a site = operator of the nearest rail edge. */
async function servingOperator(site: PlanSite): Promise<string | null> {
  const res = await getDb().execute(sql`
    SELECT operator FROM rail_edges
    WHERE operator IS NOT NULL
    ORDER BY geometry <-> ST_SetSRID(ST_MakePoint(${site.lng}, ${site.lat}), 4326)::geography
    LIMIT 1
  `);
  return rows<{ operator: string | null }>(res)[0]?.operator ?? null;
}

interface TruckLegDetail {
  distanceKm: number;
  source: "road" | "estimate";
  durationMinutes: number | null;
  coordinates: [number, number][];
}

/** Road-route a truck leg via Google, falling back to a straight line. */
async function resolveTruckLeg(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  straightLineKm: number,
): Promise<TruckLegDetail> {
  const road = await getTruckRoute(from, to);
  if (road) {
    return {
      distanceKm: road.distanceKm,
      source: "road",
      durationMinutes: road.durationMinutes,
      coordinates: road.coordinates,
    };
  }
  return {
    distanceKm: straightLineKm * ROAD_CIRCUITY_FACTOR,
    source: "estimate",
    durationMinutes: null,
    coordinates: [
      [from.lng, from.lat],
      [to.lng, to.lat],
    ],
  };
}

function truckFeature(leg: TruckLegDetail, label: string): Record<string, unknown> {
  return {
    type: "Feature",
    geometry: { type: "LineString", coordinates: leg.coordinates },
    properties: { mode: "truck", label, lengthKm: leg.distanceKm, source: leg.source },
  };
}

interface EvaluatedPlan {
  originSite: CandidateSite;
  destinationSite: CandidateSite;
  rail: FindRouteResult;
  preferredOperator: string | null;
  weightedCost: number;
}

export async function planMultimodalRoute(
  input: PlanRouteInput,
): Promise<{ ok: true; plan: PlanRouteResult } | { ok: false; failure: PlanRouteFailure }> {
  const options = input.options ?? {};
  const candidates = Math.min(
    Math.max(Math.trunc(options.siteCandidates ?? 1), 1),
    MAX_SITE_CANDIDATES,
  );
  const truckCostFactor = Math.min(Math.max(options.truckCostFactor ?? 3, 1), 10);
  const originLabel = input.origin.label ?? "Origin";
  const destinationLabel = input.destination.label ?? "Destination";

  // One extra candidate per side so same-site pairs can be skipped without
  // running out of alternatives.
  const [originSites, destinationSites] = await Promise.all([
    nearestRailServedSites(input.origin.lat, input.origin.lng, candidates + 1),
    nearestRailServedSites(input.destination.lat, input.destination.lng, candidates + 1),
  ]);
  if (originSites.length === 0) {
    return {
      ok: false,
      failure: {
        reason: "no-sites",
        message:
          "No published rail-served sites (transload / terminal / port) with a location exist yet",
      },
    };
  }
  if (originSites.length < 2 && destinationSites.length < 2 && originSites[0]?.id === destinationSites[0]?.id) {
    return {
      ok: false,
      failure: {
        reason: "same-site",
        message:
          "Origin and destination resolve to the same site — at least two located rail-served sites are needed",
      },
    };
  }

  const operatorCache = new Map<string, string | null>();
  const detectOperator = async (site: PlanSite): Promise<string | null> => {
    if (!operatorCache.has(site.id)) {
      operatorCache.set(site.id, await servingOperator(site));
    }
    return operatorCache.get(site.id) ?? null;
  };

  let best: EvaluatedPlan | null = null;
  let evaluatedPairs = 0;
  for (const o of originSites.slice(0, candidates + 1)) {
    for (const d of destinationSites.slice(0, candidates + 1)) {
      if (o.id === d.id) continue;
      if (evaluatedPairs >= candidates * candidates) break;
      evaluatedPairs++;

      let preferOperator = options.preferOperator ?? null;
      if (!preferOperator && options.preferSingleOperator) {
        preferOperator = await detectOperator(o);
      }

      const rail = await findRoute({
        origin: { lat: o.lat, lng: o.lng },
        destination: { lat: d.lat, lng: d.lng },
        options: { ...options, preferOperator: preferOperator ?? undefined },
      });
      if (!rail) continue;

      // Trucking costs several times more per km than rail, so weight it
      // when comparing site pairs — otherwise a long drayage leg can beat
      // a slightly longer but far cheaper rail haul.
      const weightedCost =
        (o.distanceKm + d.distanceKm) * ROAD_CIRCUITY_FACTOR * truckCostFactor +
        rail.totalLengthKm;
      if (!best || weightedCost < best.weightedCost) {
        best = { originSite: o, destinationSite: d, rail, preferredOperator: preferOperator, weightedCost };
      }
    }
  }

  if (!best) {
    return {
      ok: false,
      failure: {
        reason: "no-rail-path",
        message:
          "No rail path found between the candidate sites — is the track network imported?",
      },
    };
  }

  const { originSite, destinationSite, rail, preferredOperator } = best;

  // Only the winning pair's truck legs hit the (billable) Directions API.
  const [firstMile, lastMile] = await Promise.all([
    resolveTruckLeg(input.origin, originSite, originSite.distanceKm),
    resolveTruckLeg(destinationSite, input.destination, destinationSite.distanceKm),
  ]);

  const legs: PlanLeg[] = [
    {
      seq: 1,
      mode: "truck",
      from: { label: originLabel, lat: input.origin.lat, lng: input.origin.lng },
      to: { label: originSite.name, lat: originSite.lat, lng: originSite.lng },
      distanceKm: firstMile.distanceKm,
      source: firstMile.source,
      durationMinutes: firstMile.durationMinutes,
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
      distanceKm: lastMile.distanceKm,
      source: lastMile.source,
      durationMinutes: lastMile.durationMinutes,
    },
  ];

  const features: Record<string, unknown>[] = [
    truckFeature(firstMile, `${originLabel} → ${originSite.name}`),
    ...rail.geometry.features,
    truckFeature(lastMile, `${destinationSite.name} → ${destinationLabel}`),
  ];

  const truckDistanceKm = firstMile.distanceKm + lastMile.distanceKm;
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
      preferredOperator,
      evaluatedPairs,
      geometry: { type: "FeatureCollection", features },
    },
  };
}
