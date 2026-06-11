import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { organizations } from "./organizations";
import { geographyPoint, vector1024 } from "./types";

export const SECTORS = [
  "agrivalue",
  "lumber",
  "wind",
  "aggregates",
  "minerals",
  "logistics",
  "other",
] as const;
export type Sector = (typeof SECTORS)[number];

export const LISTING_STATUSES = [
  "draft",
  "pending",
  "published",
  "archived",
] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

/**
 * Marketplace / directory listings: buyers, processors, transloads,
 * terminals, logistics providers — the corridor-first "verified listings"
 * from the proposal. Full-text + trigram indexes live in a hand-written
 * migration (expression indexes, no stored tsvector column).
 */
export const directoryListings = pgTable("directory_listings", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: uuid("owner_user_id").references(() => users.id),
  organizationId: uuid("organization_id").references(() => organizations.id),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  sector: text("sector").$type<Sector>().notNull().default("other"),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  address: text("address"),
  city: text("city"),
  province: text("province"),
  location: geographyPoint("location"),
  verified: boolean("verified").notNull().default(false),
  status: text("status").$type<ListingStatus>().notNull().default("pending"),
  /** Semantic-search embedding (Titan v2); refreshed by the indexer hook. */
  embedding: vector1024("embedding"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
