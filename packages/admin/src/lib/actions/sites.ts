"use server";

import { revalidatePath } from "next/cache";
import { apiJson, type Listing, type ListingType, type Sector } from "../api";
import type { ActionResult } from "./raillines";

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Request failed" };
  }
}

export interface SiteInput {
  name: string;
  description?: string;
  listingType: ListingType;
  sector: Sector;
  city?: string;
  province?: string;
  lat?: number;
  lng?: number;
}

/**
 * Admin-created sites go straight to published + verified (create lands in
 * `pending`, so a follow-up status PATCH makes it usable by the planner
 * immediately).
 */
export async function createSiteAction(
  input: SiteInput,
): Promise<ActionResult<Listing>> {
  const result = await run(async () => {
    const created = await apiJson<Listing>("/v1/directory", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return apiJson<Listing>(`/v1/directory/${created.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "published", verified: true }),
    });
  });
  if (result.ok) {
    revalidatePath("/dashboard/sites");
    revalidatePath("/dashboard/routeplanner");
  }
  return result;
}

export async function updateSiteAction(
  id: string,
  input: Partial<SiteInput>,
): Promise<ActionResult<Listing>> {
  const result = await run(() =>
    apiJson<Listing>(`/v1/directory/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  );
  if (result.ok) {
    revalidatePath("/dashboard/sites");
    revalidatePath("/dashboard/routeplanner");
  }
  return result;
}

export async function archiveSiteAction(id: string): Promise<ActionResult<Listing>> {
  const result = await run(() =>
    apiJson<Listing>(`/v1/directory/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "archived" }),
    }),
  );
  if (result.ok) {
    revalidatePath("/dashboard/sites");
    revalidatePath("/dashboard/routeplanner");
  }
  return result;
}
