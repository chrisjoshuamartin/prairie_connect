"use server";

import { revalidatePath } from "next/cache";
import { apiJson, type Corridor } from "../api";
import type { ActionResult } from "./raillines";

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Request failed" };
  }
}

export interface CreateCorridorInput {
  name: string;
  slug?: string;
  operator?: string;
  description?: string;
  railLineId?: string;
}

export async function createCorridorAction(
  input: CreateCorridorInput,
): Promise<ActionResult<Corridor>> {
  const result = await run(() =>
    apiJson<Corridor>("/v1/admin/corridors", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  );
  if (result.ok) revalidatePath("/dashboard/corridors");
  return result;
}

export async function deleteCorridorAction(id: string): Promise<ActionResult<void>> {
  const result = await run(() =>
    apiJson<void>(`/v1/admin/corridors/${id}`, { method: "DELETE" }),
  );
  if (result.ok) revalidatePath("/dashboard/corridors");
  return result;
}
