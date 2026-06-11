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
  edgeCount: number;
  totalLengthKm: number;
  createdAt: string;
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
