import { getIdToken } from "./auth/guard";
import { fetchWithWakeRetry } from "./retry";

/**
 * Server-side client for the Prairie Connect API. The Bearer token comes
 * from the Amplify session cookie; authorization (admin role) is enforced
 * by the API itself.
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = process.env.API_URL;
  if (!base) throw new Error("API_URL is not set — run through `sst dev` or set it in the environment");

  const token = await getIdToken();
  return fetchWithWakeRetry(`${base}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  if (!res.ok) {
    let message = `API request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // Non-JSON error body; keep the status message.
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface RailLine {
  id: string;
  slug: string;
  name: string;
  operator: string | null;
  description: string | null;
  sourceName: string | null;
  logoKey: string | null;
  logoUrl: string | null;
  edgeCount: number;
  totalLengthKm: number;
  createdAt: string;
}

export interface LogoUploadUrlResponse {
  key: string;
  url: string;
  expiresIn: number;
  logoUrl: string;
}

export interface RailLineDetail extends RailLine {
  geometry: Record<string, unknown> | null;
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

export interface UpdateRailLineResult {
  id: string;
  slug: string;
  name: string;
  operator: string | null;
  description: string | null;
  geometryUpdated: boolean;
  graphRebuilt: {
    segmentCount: number;
    nodesCreated: number;
    nodesReused: number;
    edgesCreated: number;
    totalLengthKm: number;
  } | null;
}

export interface PlatformUser {
  id: string;
  email: string;
  name: string | null;
  role: "member" | "operator" | "edo" | "admin";
  createdAt: string;
}

export interface UsersPage {
  items: PlatformUser[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Corridor {
  id: string;
  slug: string;
  name: string;
  operator: string | null;
  description: string | null;
  railLineId?: string | null;
  metrics: Record<string, unknown>;
  createdAt: string;
}

export interface CorridorDetail extends Corridor {
  geometry: Record<string, unknown> | null;
}

export const LISTING_TYPES = [
  "transload",
  "port",
  "terminal",
  "elevator",
  "producer",
  "other",
] as const;
export type ListingType = (typeof LISTING_TYPES)[number];

export const SECTORS = [
  "agrivalue",
  "lumber",
  "wind",
  "aggregates",
  "minerals",
  "logistics",
  "other",
] as const;
export type Sector = (typeof SECTORS)[number];

export interface Listing {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sector: Sector;
  listingType: ListingType;
  tags: string[];
  address: string | null;
  city: string | null;
  province: string | null;
  lat: number | null;
  lng: number | null;
  verified: boolean;
  status: "draft" | "pending" | "published" | "archived";
  createdAt: string;
  updatedAt: string;
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
  durationMinutes?: number | null;
  railDetail?: {
    segments: {
      seq: number;
      edgeId: number | null;
      mode: string;
      operator: string | null;
      fromNode: { id: number; name: string | null };
      toNode: { id: number; name: string | null };
      lengthKm: number | null;
    }[];
    nearestOriginNode: { id: number; name: string | null; distanceKm: number };
    nearestDestinationNode: { id: number; name: string | null; distanceKm: number };
  };
}

export interface PlanOptions {
  useYardConnectors?: boolean;
  yardCostFactor?: number;
  preferSingleOperator?: boolean;
  operatorPenaltyFactor?: number;
  siteCandidates?: number;
  truckCostFactor?: number;
}

export interface PlanRouteResult {
  legs: PlanLeg[];
  originSite: PlanSite;
  destinationSite: PlanSite;
  totalDistanceKm: number;
  truckDistanceKm: number;
  railDistanceKm: number;
  preferredOperator: string | null;
  evaluatedPairs: number;
  geometry: { type: "FeatureCollection"; features: Record<string, unknown>[] };
}
