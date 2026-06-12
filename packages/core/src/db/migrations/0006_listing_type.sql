ALTER TABLE "directory_listings" ADD COLUMN "listing_type" text DEFAULT 'other' NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "directory_listings_listing_type_idx" ON "directory_listings" ("listing_type");
