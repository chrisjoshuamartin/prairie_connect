"use server";

import { apiFetch, type PlanRouteResult } from "../api";
import type { ActionResult } from "./raillines";

export interface PlanRequest {
  origin: { lat: number; lng: number; label?: string };
  destination: { lat: number; lng: number; label?: string };
}

export async function planRouteAction(
  input: PlanRequest,
): Promise<ActionResult<PlanRouteResult>> {
  try {
    const res = await apiFetch("/v1/routes/plan", {
      method: "POST",
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      let message = `Planning failed (${res.status})`;
      try {
        const body = (await res.json()) as { error?: string };
        if (body.error) message = body.error;
      } catch {
        // keep status message
      }
      return { ok: false, error: message };
    }
    return { ok: true, data: (await res.json()) as PlanRouteResult };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Request failed" };
  }
}
