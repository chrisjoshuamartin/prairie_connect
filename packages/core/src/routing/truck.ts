/**
 * Real road routing for the truck (drayage) legs via the Google Routes
 * API. Strictly optional: when GOOGLE_MAPS_API_KEY is unset or a request
 * fails, callers fall back to the straight-line × circuity estimate, so
 * the planner works without any Google setup.
 */

const ROUTES_ENDPOINT = "https://routes.googleapis.com/directions/v2:computeRoutes";
const TIMEOUT_MS = 5000;

export interface TruckRoute {
  distanceKm: number;
  durationMinutes: number | null;
  /** [lng, lat] positions of the road geometry. */
  coordinates: [number, number][];
}

/** Decode a Google encoded polyline into [lng, lat] positions. */
export function decodePolyline(encoded: string): [number, number][] {
  const coords: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    for (const which of [0, 1] as const) {
      let result = 0;
      let shift = 0;
      let byte: number;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += delta;
      else lng += delta;
    }
    coords.push([lng / 1e5, lat / 1e5]);
  }
  return coords;
}

export function truckRoutingEnabled(): boolean {
  return Boolean(process.env.GOOGLE_MAPS_API_KEY);
}

export async function getTruckRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): Promise<TruckRoute | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(ROUTES_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
        "x-goog-fieldmask":
          "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline",
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
        destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
        travelMode: "DRIVE",
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`[truck] Routes API ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return null;
    }
    const body = (await res.json()) as {
      routes?: {
        distanceMeters?: number;
        duration?: string;
        polyline?: { encodedPolyline?: string };
      }[];
    };
    const route = body.routes?.[0];
    if (!route?.distanceMeters || !route.polyline?.encodedPolyline) return null;

    const durationSeconds = route.duration
      ? Number(route.duration.replace(/s$/, ""))
      : NaN;
    return {
      distanceKm: route.distanceMeters / 1000,
      durationMinutes: Number.isFinite(durationSeconds)
        ? durationSeconds / 60
        : null,
      coordinates: decodePolyline(route.polyline.encodedPolyline),
    };
  } catch (err) {
    console.warn("[truck] Routes API request failed:", err);
    return null;
  }
}
