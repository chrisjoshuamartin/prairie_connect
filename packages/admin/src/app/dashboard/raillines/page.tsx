import { requireAdmin } from "@/lib/auth/guard";
import { apiJson, type RailLine } from "@/lib/api";
import { RaillinesClient } from "./RaillinesClient";

export const dynamic = "force-dynamic";

export default async function RaillinesPage() {
  await requireAdmin();
  const raillines = await apiJson<RailLine[]>("/v1/admin/raillines");
  return <RaillinesClient initialRaillines={raillines} />;
}
