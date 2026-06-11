/**
 * Search abstraction. The Postgres implementation (FTS + trigram + PostGIS
 * + pgvector hybrid) is the default; an Algolia or OpenSearch provider can
 * be slotted in later without touching API routes — implement this
 * interface and swap it in `search/index.ts`.
 */
export type SearchMode = "keyword" | "semantic" | "hybrid";

export interface SearchQuery {
  q: string;
  sector?: string;
  /** Geo filter: only listings within radiusKm of (lat, lng). */
  near?: { lat: number; lng: number; radiusKm: number };
  limit?: number;
  mode?: SearchMode;
}

export interface SearchHit {
  id: string;
  name: string;
  slug: string;
  sector: string;
  description: string | null;
  city: string | null;
  province: string | null;
  verified: boolean;
  score: number;
  distanceKm?: number;
}

export interface SearchProvider {
  search(query: SearchQuery): Promise<SearchHit[]>;
  /** Suggestions for autocomplete (trigram prefix/fuzzy match). */
  suggest(q: string, limit?: number): Promise<string[]>;
  /** (Re)index one listing — refresh its embedding / push to external index. */
  index(listingId: string): Promise<void>;
  remove(listingId: string): Promise<void>;
}
