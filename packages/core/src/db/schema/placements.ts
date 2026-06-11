import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { directoryListings } from "./directory";
import { corridors } from "./corridors";

/**
 * Where/when a placement shows. Empty arrays mean "everywhere" for that
 * dimension; a request matches when every dimension it specifies is either
 * untargeted or contains the requested value.
 */
export interface PlacementTargeting {
  /** UI surfaces: "home" | "search" | "directory" | "corridor" | "intent" | "listing" | "route-finder" */
  pages?: string[];
  sectors?: string[];
  /** Province codes, lowercase: "bc" | "ab" | "sk" | "mb" */
  regions?: string[];
  /** Corridor slugs. */
  corridors?: string[];
  /** Intent slugs. */
  intents?: string[];
  /** e.g. "transload", "terminal" */
  listingTypes?: string[];
}

/**
 * Premium listings, corridor sponsors, featured partners — the monetizable
 * placement inventory from the proposal (priority listings / ad placement).
 */
export const featuredPlacements = pgTable("featured_placements", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  linkUrl: text("link_url"),
  /** Optional link to platform entities the placement promotes. */
  listingId: uuid("listing_id").references(() => directoryListings.id),
  corridorId: uuid("corridor_id").references(() => corridors.id),
  targeting: jsonb("targeting")
    .$type<PlacementTargeting>()
    .notNull()
    .default({}),
  /** Higher weight sorts first within a surface. */
  weight: integer("weight").notNull().default(0),
  active: boolean("active").notNull().default(true),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
