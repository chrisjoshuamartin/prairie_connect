import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import type { Sector } from "./directory";

/**
 * Structured content for one guided pathway ("I want to..."). Kept as
 * jsonb so curation doesn't require schema migrations; the admin upsert
 * endpoint validates the shape with Zod.
 */
export interface IntentConfig {
  /** Pre-canned search terms to offer as chips. */
  searchTerms?: string[];
  /** Filters to apply when handing off to search/directory. */
  defaultFilters?: { sector?: Sector; q?: string };
  /** Where the pathway primarily lands, e.g. "/route-finder". */
  destinationPath?: string;
  /** CTA buttons. */
  ctas?: { label: string; path: string }[];
  /** Questions the UI walks the user through. */
  guidedQuestions?: string[];
  /** "Ask AI" starter prompts (also keeps tokens down vs free-typing). */
  aiPrompts?: string[];
  /** Corridor slugs to surface on the pathway page. */
  relatedCorridorSlugs?: string[];
}

/**
 * Curated "I want to..." pathways. These drive guided navigation so basic
 * intents never burn AI tokens.
 */
export const intents = pgTable("intents", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  intro: text("intro"),
  icon: text("icon"),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  config: jsonb("config").$type<IntentConfig>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
