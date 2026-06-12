import { requireAdmin } from "@/lib/auth/guard";
import { apiJson, type Listing } from "@/lib/api";
import { SitesClient } from "./SitesClient";

export const dynamic = "force-dynamic";

export default async function SitesPage() {
  await requireAdmin();
  const sites = await apiJson<Listing[]>("/v1/directory?limit=100");
  return <SitesClient initialSites={sites} />;
}
