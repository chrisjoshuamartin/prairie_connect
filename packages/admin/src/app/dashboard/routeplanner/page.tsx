import { requireAdmin } from "@/lib/auth/guard";
import { apiJson, type Listing } from "@/lib/api";
import { RoutePlannerClient } from "./RoutePlannerClient";

export const dynamic = "force-dynamic";

export default async function RoutePlannerPage() {
  await requireAdmin();
  const sites = await apiJson<Listing[]>("/v1/directory?limit=100");
  return <RoutePlannerClient sites={sites} />;
}
