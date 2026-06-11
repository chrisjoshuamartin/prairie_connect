/**
 * Seed demo featured placements so the frontend has real inventory to
 * render. Idempotent: existing placements (matched by title) are skipped,
 * so re-runs never duplicate and admin edits survive.
 *
 * Run inside an SST shell so Resource bindings resolve:
 *   npm run seed:placements:dev
 */
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../packages/core/src/db/client";
import {
  featuredPlacements,
  corridors,
  type PlacementTargeting,
} from "../packages/core/src/db/schema/index";

interface SeedPlacement {
  title: string;
  description: string;
  linkUrl?: string;
  /** Resolved to corridorId at runtime if the corridor exists. */
  corridorSlug?: string;
  targeting: PlacementTargeting;
  weight: number;
}

const SEEDS: SeedPlacement[] = [
  {
    title: "Great Western Railway — Corridor Sponsor",
    description:
      "Serving southwest Saskatchewan with reliable short line service, transloading, and railcar storage.",
    linkUrl: "/corridors/gwr",
    corridorSlug: "gwr",
    targeting: { pages: ["corridor", "intent"], corridors: ["gwr"], regions: ["sk"] },
    weight: 100,
  },
  {
    title: "Prairie Transload Solutions",
    description:
      "Full-service truck-to-rail transloading near Saskatoon. Grain, fertilizer, and project cargo.",
    linkUrl: "/contact?intent=find-transload-site",
    targeting: {
      pages: ["search", "directory", "intent"],
      sectors: ["logistics"],
      intents: ["find-transload-site", "move-goods-by-rail"],
      listingTypes: ["transload"],
      regions: ["sk"],
    },
    weight: 80,
  },
  {
    title: "AgriValue Processing Park",
    description:
      "Rail-served industrial park with zoned, shovel-ready sites for value-added agriculture.",
    linkUrl: "/contact?intent=build-near-rail",
    targeting: {
      pages: ["search", "intent", "map"],
      sectors: ["agrivalue"],
      intents: ["build-near-rail", "find-buyers-processors"],
    },
    weight: 60,
  },
  {
    title: "Shortline Railcar Storage Network",
    description:
      "Competitive railcar storage capacity across the Prairie short line network. Inquire for availability.",
    linkUrl: "/contact?intent=find-railcar-storage",
    targeting: { intents: ["find-railcar-storage"] },
    weight: 50,
  },
  {
    title: "Prairie Connect Featured Partner Program",
    description:
      "Put your railway, facility, or development site in front of shippers and investors. Become a featured partner.",
    linkUrl: "/contact?intent=promote-my-railway-or-site",
    // No targeting: matches every surface — the house ad / fallback card.
    targeting: {},
    weight: 10,
  },
];

async function seed() {
  const db = getDb();

  const existing = await db
    .select({ title: featuredPlacements.title })
    .from(featuredPlacements)
    .where(inArray(featuredPlacements.title, SEEDS.map((s) => s.title)));
  const existingTitles = new Set(existing.map((r) => r.title));

  let created = 0;
  for (const s of SEEDS) {
    if (existingTitles.has(s.title)) {
      console.log(`skip (exists): ${s.title}`);
      continue;
    }

    let corridorId: string | null = null;
    if (s.corridorSlug) {
      const [corridor] = await db
        .select({ id: corridors.id })
        .from(corridors)
        .where(eq(corridors.slug, s.corridorSlug));
      corridorId = corridor?.id ?? null;
      if (!corridorId) {
        console.log(`  note: corridor '${s.corridorSlug}' not found, seeding without link`);
      }
    }

    await db.insert(featuredPlacements).values({
      title: s.title,
      description: s.description,
      linkUrl: s.linkUrl,
      corridorId,
      targeting: s.targeting,
      weight: s.weight,
      active: true,
    });
    console.log(`created: ${s.title}`);
    created++;
  }

  console.log(`\nDone. ${created} created, ${SEEDS.length - created} skipped.`);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
