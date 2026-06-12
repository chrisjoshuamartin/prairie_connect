/**
 * Seed demo directory sites (transloads, terminals, a port) so the
 * multimodal route planner has somewhere to route between. Idempotent:
 * existing listings (matched by slug) are skipped, so re-runs never
 * duplicate and admin edits survive.
 *
 * Run inside an SST shell so Resource bindings resolve:
 *   npm run seed:sites:dev
 */
import { inArray } from "drizzle-orm";
import { getDb } from "../packages/core/src/db/client";
import {
  directoryListings,
  type ListingType,
  type Sector,
} from "../packages/core/src/db/schema/index";
import { ewktPoint, geographyFromEwkt } from "../packages/core/src/db/schema/types";

interface SeedSite {
  slug: string;
  name: string;
  description: string;
  listingType: ListingType;
  sector: Sector;
  city: string;
  province: string;
  lat: number;
  lng: number;
  tags: string[];
}

const SEEDS: SeedSite[] = [
  {
    slug: "weyburn-inland-terminal-transload",
    name: "Weyburn Inland Terminal Transload",
    description:
      "Truck-to-rail transload on the CP Weyburn subdivision. Grain, pulses, and fertilizer handling for southeast Saskatchewan.",
    listingType: "transload",
    sector: "logistics",
    city: "Weyburn",
    province: "SK",
    lat: 49.6578,
    lng: -103.8457,
    tags: ["transload", "grain", "fertilizer"],
  },
  {
    slug: "saskatoon-north-transload",
    name: "Saskatoon North Transload",
    description:
      "Full-service transload facility in Saskatoon's north industrial area. Ag products, aggregates, and dimensional loads.",
    listingType: "transload",
    sector: "logistics",
    city: "Saskatoon",
    province: "SK",
    lat: 52.1859,
    lng: -106.6164,
    tags: ["transload", "agrivalue", "aggregates"],
  },
  {
    slug: "regina-intermodal-terminal",
    name: "Regina Intermodal Terminal",
    description:
      "Intermodal and transload terminal serving the Regina region — containers, lumber, and steel.",
    listingType: "terminal",
    sector: "logistics",
    city: "Regina",
    province: "SK",
    lat: 50.4756,
    lng: -104.6896,
    tags: ["terminal", "intermodal", "lumber"],
  },
  {
    slug: "calgary-south-transload",
    name: "Calgary South Transload",
    description:
      "Transload and railcar staging in southeast Calgary with direct mainline access. Energy, building products, and bulk.",
    listingType: "transload",
    sector: "logistics",
    city: "Calgary",
    province: "AB",
    lat: 51.0014,
    lng: -114.0093,
    tags: ["transload", "bulk"],
  },
  {
    slug: "edmonton-bulk-transload",
    name: "Edmonton Bulk Transload",
    description:
      "Bulk commodity transload northwest of downtown Edmonton — petrochemicals, frac sand, and ag inputs.",
    listingType: "transload",
    sector: "logistics",
    city: "Edmonton",
    province: "AB",
    lat: 53.5816,
    lng: -113.5645,
    tags: ["transload", "bulk", "petrochemical"],
  },
  {
    slug: "kamloops-transload-terminal",
    name: "Kamloops Transload Terminal",
    description:
      "Interior BC transload on the CN mainline — lumber, OSB, and mining supplies between road and rail.",
    listingType: "transload",
    sector: "logistics",
    city: "Kamloops",
    province: "BC",
    lat: 50.6745,
    lng: -120.3273,
    tags: ["transload", "lumber"],
  },
  {
    slug: "port-of-vancouver",
    name: "Port of Vancouver",
    description:
      "Canada's largest port — export gateway for grain, potash, coal, and containers moving to Pacific markets.",
    listingType: "port",
    sector: "logistics",
    city: "Vancouver",
    province: "BC",
    lat: 49.2891,
    lng: -123.0827,
    tags: ["port", "export", "containers"],
  },
  {
    slug: "port-of-prince-rupert",
    name: "Port of Prince Rupert",
    description:
      "Deep-water Pacific gateway on the CN northern mainline — fastest rail connection from the Prairies to Asia.",
    listingType: "port",
    sector: "logistics",
    city: "Prince Rupert",
    province: "BC",
    lat: 54.3092,
    lng: -130.3239,
    tags: ["port", "export"],
  },
];

async function seed() {
  const db = getDb();

  const existing = await db
    .select({ slug: directoryListings.slug })
    .from(directoryListings)
    .where(inArray(directoryListings.slug, SEEDS.map((s) => s.slug)));
  const existingSlugs = new Set(existing.map((r) => r.slug));

  let created = 0;
  for (const s of SEEDS) {
    if (existingSlugs.has(s.slug)) {
      console.log(`skip (exists): ${s.name}`);
      continue;
    }
    await db.insert(directoryListings).values({
      slug: s.slug,
      name: s.name,
      description: s.description,
      sector: s.sector,
      listingType: s.listingType,
      tags: s.tags,
      city: s.city,
      province: s.province,
      location: geographyFromEwkt(ewktPoint(s.lng, s.lat)) as unknown as string,
      status: "published",
      verified: true,
    });
    console.log(`created: ${s.name} (${s.listingType})`);
    created++;
  }

  console.log(`\nDone. ${created} created, ${SEEDS.length - created} skipped.`);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
