-- Search, geo, routing, and Bedrock Knowledge Base support.
-- Hand-written (drizzle-kit can't express expression indexes or the KB schema).

-- Full-text search over listings (expression index — no stored tsvector column)
CREATE INDEX IF NOT EXISTS directory_listings_fts_idx
  ON directory_listings
  USING gin (to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, '')));--> statement-breakpoint

-- Trigram fuzzy match / autocomplete on listing names
CREATE INDEX IF NOT EXISTS directory_listings_name_trgm_idx
  ON directory_listings
  USING gin (name gin_trgm_ops);--> statement-breakpoint

-- Geo lookups (ST_DWithin filters, KNN nearest-node snapping)
CREATE INDEX IF NOT EXISTS directory_listings_location_idx
  ON directory_listings
  USING gist (location);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS rail_nodes_location_idx
  ON rail_nodes
  USING gist (location);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS rail_edges_geometry_idx
  ON rail_edges
  USING gist (geometry);--> statement-breakpoint

-- pgRouting graph traversal
CREATE INDEX IF NOT EXISTS rail_edges_source_idx ON rail_edges (source_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS rail_edges_target_idx ON rail_edges (target_id);--> statement-breakpoint

-- Semantic search over listing embeddings (HNSW, cosine)
CREATE INDEX IF NOT EXISTS directory_listings_embedding_idx
  ON directory_listings
  USING hnsw (embedding vector_cosine_ops);--> statement-breakpoint

-- Bedrock Knowledge Base vector store (AWS-prescribed shape: see
-- "Using Aurora PostgreSQL as a Knowledge Base for Amazon Bedrock").
-- Point the KB at schema bedrock_integration, table bedrock_kb with the
-- column mappings id/embedding/chunks/metadata/custom_metadata.
CREATE SCHEMA IF NOT EXISTS bedrock_integration;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS bedrock_integration.bedrock_kb (
  id uuid PRIMARY KEY,
  embedding vector(1024),
  chunks text,
  metadata json,
  custom_metadata jsonb
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS bedrock_kb_embedding_idx
  ON bedrock_integration.bedrock_kb
  USING hnsw (embedding vector_cosine_ops)
  WITH (ef_construction = 256);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS bedrock_kb_chunks_fts_idx
  ON bedrock_integration.bedrock_kb
  USING gin (to_tsvector('simple', chunks));--> statement-breakpoint

CREATE INDEX IF NOT EXISTS bedrock_kb_custom_metadata_idx
  ON bedrock_integration.bedrock_kb
  USING gin (custom_metadata);
