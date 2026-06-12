import { sql, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { directoryListings } from "../db/schema/index";
import { embedText } from "../ai/embeddings";
import type { SearchHit, SearchProvider, SearchQuery } from "./provider";

function rows<T>(res: unknown): T[] {
  // drizzle's execute() return shape differs between drivers; normalize.
  const r = res as { rows?: T[] };
  return (r.rows ?? (res as T[])) as T[];
}

interface HitRow {
  id: string;
  name: string;
  slug: string;
  sector: string;
  description: string | null;
  city: string | null;
  province: string | null;
  verified: boolean;
  score: number;
  distance_km: number | null;
}

function baseFilters(query: SearchQuery) {
  const filters = [sql`status = 'published'`];
  if (query.sector) filters.push(sql`sector = ${query.sector}`);
  if (query.near) {
    const { lat, lng, radiusKm } = query.near;
    filters.push(
      sql`ST_DWithin(location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radiusKm * 1000})`,
    );
  }
  return sql.join(filters, sql` AND `);
}

function distanceSelect(query: SearchQuery) {
  if (!query.near) return sql`NULL::double precision AS distance_km`;
  const { lat, lng } = query.near;
  return sql`ST_Distance(location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography) / 1000.0 AS distance_km`;
}

function toHit(r: HitRow): SearchHit {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    sector: r.sector,
    description: r.description,
    city: r.city,
    province: r.province,
    verified: r.verified,
    score: Number(r.score),
    ...(r.distance_km != null ? { distanceKm: Number(r.distance_km) } : {}),
  };
}

async function keywordSearch(query: SearchQuery, limit: number): Promise<SearchHit[]> {
  const doc = sql`to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, ''))`;
  const res = await getDb().execute(sql`
    SELECT id, name, slug, sector, description, city, province, verified,
      GREATEST(
        ts_rank(${doc}, websearch_to_tsquery('english', ${query.q})),
        similarity(name, ${query.q})
      ) AS score,
      ${distanceSelect(query)}
    FROM directory_listings
    WHERE ${baseFilters(query)}
      AND (${doc} @@ websearch_to_tsquery('english', ${query.q}) OR name % ${query.q})
    ORDER BY score DESC
    LIMIT ${limit}
  `);
  return rows<HitRow>(res).map(toHit);
}

async function semanticSearch(query: SearchQuery, limit: number): Promise<SearchHit[]> {
  const vector = await embedText(query.q);
  const vectorLiteral = `[${vector.join(",")}]`;
  const res = await getDb().execute(sql`
    SELECT id, name, slug, sector, description, city, province, verified,
      1 - (embedding <=> ${vectorLiteral}::vector) AS score,
      ${distanceSelect(query)}
    FROM directory_listings
    WHERE ${baseFilters(query)} AND embedding IS NOT NULL
    ORDER BY embedding <=> ${vectorLiteral}::vector
    LIMIT ${limit}
  `);
  return rows<HitRow>(res).map(toHit);
}

/** Reciprocal rank fusion of keyword + semantic result lists. */
function fuse(lists: SearchHit[][], limit: number): SearchHit[] {
  const k = 60;
  const scores = new Map<string, { hit: SearchHit; score: number }>();
  for (const list of lists) {
    list.forEach((hit, rank) => {
      const entry = scores.get(hit.id) ?? { hit, score: 0 };
      entry.score += 1 / (k + rank + 1);
      scores.set(hit.id, entry);
    });
  }
  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ hit, score }) => ({ ...hit, score }));
}

export const postgresSearchProvider: SearchProvider = {
  async search(query: SearchQuery): Promise<SearchHit[]> {
    const limit = Math.min(query.limit ?? 20, 100);
    const mode = query.mode ?? "keyword";
    if (mode === "keyword") return keywordSearch(query, limit);
    if (mode === "semantic") return semanticSearch(query, limit);
    const [kw, sem] = await Promise.all([
      keywordSearch(query, limit),
      semanticSearch(query, limit).catch((err) => {
        // Semantic half is best-effort (no embeddings yet, model issue) —
        // hybrid degrades to keyword instead of failing the request.
        console.warn("[search] semantic search failed, using keyword only", err);
        return [] as SearchHit[];
      }),
    ]);
    return fuse([kw, sem], limit);
  },

  async suggest(q: string, limit = 8): Promise<string[]> {
    const res = await getDb().execute(sql`
      SELECT name FROM directory_listings
      WHERE status = 'published' AND (name ILIKE ${q + "%"} OR name % ${q})
      ORDER BY similarity(name, ${q}) DESC
      LIMIT ${Math.min(limit, 20)}
    `);
    return rows<{ name: string }>(res).map((r) => r.name);
  },

  async index(listingId: string): Promise<void> {
    const db = getDb();
    const [listing] = await db
      .select({
        name: directoryListings.name,
        description: directoryListings.description,
        sector: directoryListings.sector,
        tags: directoryListings.tags,
      })
      .from(directoryListings)
      .where(eq(directoryListings.id, listingId));
    if (!listing) return;
    const text = [listing.name, listing.description, listing.sector, ...(listing.tags ?? [])]
      .filter(Boolean)
      .join("\n");
    const embedding = await embedText(text);
    await db
      .update(directoryListings)
      .set({ embedding })
      .where(eq(directoryListings.id, listingId));
  },

  async remove(_listingId: string): Promise<void> {
    // Nothing to do for the Postgres provider — the row is the index.
  },
};
