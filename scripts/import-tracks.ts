/**
 * Import the national track reference GeoJSON (track_reference/*.geojson)
 * into the rail routing graph. Filters to the routable network (Operational
 * Main / Connecting / Wye trackage), groups into one rail line per
 * operator + province, and bulk-derives rail_nodes / rail_edges.
 *
 * Idempotent: operator+province groups whose rail line already exists are
 * skipped. Pass --replace to delete and rebuild them.
 *
 * Run inside an SST shell so Resource bindings resolve:
 *   npm run tracks:import:dev            # all files in track_reference/
 *   npm run tracks:import:dev -- --replace
 *   npm run tracks:import:dev -- track_reference/Track_sk.geojson
 */
import { readdir, readFile } from "fs/promises";
import { basename, join, resolve } from "path";
import { importTrackNetwork } from "../packages/core/src/rail/import-network";

const TRACK_DIR = "track_reference";

function provinceFromFilename(file: string): string | undefined {
  const match = /track[_-]?([a-z]{2})/i.exec(basename(file));
  return match ? match[1].toUpperCase() : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const replace = args.includes("--replace");
  let files = args.filter((a) => !a.startsWith("--"));

  if (files.length === 0) {
    const entries = await readdir(TRACK_DIR);
    files = entries
      .filter((e) => e.endsWith(".geojson") || e.endsWith(".json"))
      .sort()
      .map((e) => join(TRACK_DIR, e));
  }
  if (files.length === 0) {
    console.error(`No GeoJSON files found in ${TRACK_DIR}/`);
    process.exit(1);
  }

  for (const file of files) {
    const path = resolve(file);
    console.log(`\n=== ${basename(file)} ===`);
    const raw = await readFile(path, "utf-8");
    const geojson = JSON.parse(raw);

    const started = Date.now();
    const result = await importTrackNetwork({
      geojson,
      sourceName: basename(file),
      replace,
      defaultProvince: provinceFromFilename(file),
    });

    console.log(
      `${result.routableCount}/${result.featureCount} routable segments in ${((Date.now() - started) / 1000).toFixed(1)}s`,
    );
    for (const g of result.groups) {
      if (g.status === "skipped") {
        console.log(`  skip (exists): ${g.name} [${g.slug}]`);
      } else {
        console.log(
          `  ${g.status}: ${g.name} — ${g.edgesCreated} edges, ` +
            `${g.nodesCreated} nodes (+${g.nodesReused} reused), ` +
            `${Math.round(g.totalLengthKm)} km`,
        );
      }
    }
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
