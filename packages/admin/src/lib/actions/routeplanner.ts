"use server";

import { apiFetch, type PlanOptions, type PlanRouteResult } from "../api";
import type { ActionResult } from "./raillines";

export interface PlanRequest {
  origin: { lat: number; lng: number; label?: string };
  destination: { lat: number; lng: number; label?: string };
  options?: PlanOptions;
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

export interface PlanPreset {
  id: string;
  label: string;
  options: PlanOptions;
}

export type PlanAlternative = { id: string; label: string } & (
  | { ok: true; plan: PlanRouteResult }
  | { ok: false; error: string }
);

/**
 * Compute one plan per preset in parallel (server actions invoked from the
 * client are queued sequentially, so the fan-out lives here).
 */
export async function planRouteAlternativesAction(
  origin: PlanRequest["origin"],
  destination: PlanRequest["destination"],
  presets: PlanPreset[],
): Promise<PlanAlternative[]> {
  return Promise.all(
    presets.slice(0, 5).map(async (preset): Promise<PlanAlternative> => {
      const res = await planRouteAction({
        origin,
        destination,
        options: preset.options,
      });
      return res.ok
        ? { id: preset.id, label: preset.label, ok: true, plan: res.data }
        : { id: preset.id, label: preset.label, ok: false, error: res.error };
    }),
  );
}
