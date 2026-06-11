import { requireAdmin } from "@/lib/auth/guard";
import { apiJson, type Corridor, type RailLine } from "@/lib/api";
import { CorridorsClient } from "./CorridorsClient";

export const dynamic = "force-dynamic";

export default async function CorridorsPage() {
  await requireAdmin();
  const [corridors, raillines] = await Promise.all([
    apiJson<Corridor[]>("/v1/corridors"),
    apiJson<RailLine[]>("/v1/admin/raillines"),
  ]);
  return <CorridorsClient initialCorridors={corridors} raillines={raillines} />;
}
