"use server";

import { revalidatePath } from "next/cache";
import { apiJson, type ImportRailLineResult, type RailLineDetail } from "../api";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Request failed" };
  }
}

export interface ImportRailLineInput {
  name: string;
  slug?: string;
  operator?: string;
  description?: string;
  /** Raw GeoJSON text from the uploaded file. */
  geojson: string;
  sourceName?: string;
  buildGraph: boolean;
  snapToleranceM: number;
}

export async function importRailLineAction(
  input: ImportRailLineInput,
): Promise<ActionResult<ImportRailLineResult>> {
  const result = await run(() =>
    apiJson<ImportRailLineResult>("/v1/admin/raillines", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  );
  if (result.ok) revalidatePath("/dashboard/raillines");
  return result;
}

export async function deleteRailLineAction(id: string): Promise<ActionResult<void>> {
  const result = await run(() =>
    apiJson<void>(`/v1/admin/raillines/${id}`, { method: "DELETE" }),
  );
  if (result.ok) {
    revalidatePath("/dashboard/raillines");
    revalidatePath("/dashboard/corridors");
  }
  return result;
}

export async function getRailLineDetailAction(
  id: string,
): Promise<ActionResult<RailLineDetail>> {
  return run(() => apiJson<RailLineDetail>(`/v1/admin/raillines/${id}`));
}
