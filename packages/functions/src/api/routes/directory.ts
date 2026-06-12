import { createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { getDb } from "@prairie-connect/core/db/client";
import {
  directoryListings,
  listingDataColumns,
  SECTORS,
  LISTING_TYPES,
} from "@prairie-connect/core/db/schema/index";
import { ewktPoint } from "@prairie-connect/core/db/schema/types";
import { searchProvider } from "@prairie-connect/core/search/index";
import { requireDbUser } from "../middleware/auth";
import { CreateListingSchema, ListingSchema } from "../schemas";
import {
  createRouter,
  jsonOf,
  unauthorized,
  forbidden,
  notFound,
  bearerSecurity,
} from "../openapi";
import type { AppEnv } from "../types";

export const directoryRoutes = createRouter();

/**
 * The Data API can't return geography values, so the raw `location` column
 * is excluded and coordinates are selected as ST_X/ST_Y expressions.
 */
const listingSelection = {
  ...listingDataColumns,
  lat: sql<number | null>`ST_Y(${directoryListings.location}::geometry)`.as("lat"),
  lng: sql<number | null>`ST_X(${directoryListings.location}::geometry)`.as("lng"),
};

type ListingRow = Omit<
  typeof directoryListings.$inferSelect,
  "location" | "embedding"
> & { lat: number | null; lng: number | null };

function serialize(listing: ListingRow) {
  return {
    id: listing.id,
    name: listing.name,
    slug: listing.slug,
    description: listing.description,
    sector: listing.sector,
    listingType: listing.listingType,
    tags: listing.tags,
    address: listing.address,
    city: listing.city,
    province: listing.province,
    lat: listing.lat != null ? Number(listing.lat) : null,
    lng: listing.lng != null ? Number(listing.lng) : null,
    verified: listing.verified,
    status: listing.status,
    createdAt: listing.createdAt.toISOString(),
    updatedAt: listing.updatedAt.toISOString(),
  };
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

directoryRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/directory",
    tags: ["Directory"],
    summary: "Browse published listings",
    request: {
      query: z.object({
        sector: z.enum(SECTORS).optional(),
        type: z.enum(LISTING_TYPES).optional(),
        q: z.string().max(200).optional(),
        limit: z.coerce.number().int().positive().max(100).default(20),
        offset: z.coerce.number().int().min(0).default(0),
      }),
    },
    responses: {
      200: jsonOf(z.array(ListingSchema), "Published directory listings"),
    },
  }),
  async (c) => {
    const { sector, type, q, limit, offset } = c.req.valid("query");
    const filters = [eq(directoryListings.status, "published")];
    if (sector) filters.push(eq(directoryListings.sector, sector));
    if (type) filters.push(eq(directoryListings.listingType, type));
    if (q) {
      filters.push(
        or(
          ilike(directoryListings.name, `%${q}%`),
          ilike(directoryListings.description, `%${q}%`),
        )!,
      );
    }
    const listings = await getDb()
      .select(listingSelection)
      .from(directoryListings)
      .where(and(...filters))
      .orderBy(desc(directoryListings.verified), desc(directoryListings.createdAt))
      .limit(limit)
      .offset(offset);
    return c.json(listings.map(serialize), 200);
  },
);

directoryRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/directory/{idOrSlug}",
    tags: ["Directory"],
    summary: "Get one listing by id or slug",
    request: { params: z.object({ idOrSlug: z.string() }) },
    responses: {
      200: jsonOf(ListingSchema, "The listing"),
      ...notFound,
    },
  }),
  async (c) => {
    const { idOrSlug } = c.req.valid("param");
    const isUuid = /^[0-9a-f-]{36}$/i.test(idOrSlug);
    const [listing] = await getDb()
      .select(listingSelection)
      .from(directoryListings)
      .where(
        isUuid
          ? eq(directoryListings.id, idOrSlug)
          : eq(directoryListings.slug, idOrSlug),
      );
    if (!listing || listing.status === "archived") {
      throw new HTTPException(404, { message: "Listing not found" });
    }
    return c.json(serialize(listing), 200);
  },
);

directoryRoutes.openapi(
  createRoute({
    method: "post",
    path: "/v1/directory",
    tags: ["Directory"],
    summary: "Submit a listing",
    description:
      "Creates a listing in `pending` status. Admins move it to `published` after verification.",
    security: bearerSecurity,
    request: {
      body: { content: { "application/json": { schema: CreateListingSchema } }, required: true },
    },
    responses: {
      201: jsonOf(ListingSchema, "The created listing"),
      ...unauthorized,
    },
  }),
  async (c) => {
    const user = await requireDbUser(c);
    const body = c.req.valid("json");
    const db = getDb();

    const base = slugify(body.name);
    const existing = await db
      .select({ slug: directoryListings.slug })
      .from(directoryListings)
      .where(eq(directoryListings.slug, base));
    const slug = existing.length
      ? `${base}-${Math.random().toString(36).slice(2, 7)}`
      : base;

    const [listing] = await db
      .insert(directoryListings)
      .values({
        ownerUserId: user.id,
        name: body.name,
        slug,
        description: body.description ?? null,
        sector: body.sector,
        listingType: body.listingType,
        tags: body.tags,
        address: body.address ?? null,
        city: body.city ?? null,
        province: body.province ?? null,
        location:
          body.lat !== undefined && body.lng !== undefined
            ? ewktPoint(body.lng, body.lat)
            : undefined,
      })
      .returning(listingSelection);

    // Best-effort embedding refresh so the listing is semantically
    // searchable as soon as it's published.
    searchProvider.index(listing.id).catch((err) =>
      console.warn("[directory] index failed", err),
    );

    return c.json(serialize(listing), 201);
  },
);

const UpdateListingSchema = CreateListingSchema.partial().extend({
  status: z.enum(["draft", "pending", "published", "archived"]).optional(),
  verified: z.boolean().optional(),
});

directoryRoutes.openapi(
  createRoute({
    method: "patch",
    path: "/v1/directory/{id}",
    tags: ["Directory"],
    summary: "Update a listing",
    description:
      "Owners can edit their own listings; only admins can change `status` or `verified`.",
    security: bearerSecurity,
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: { content: { "application/json": { schema: UpdateListingSchema } }, required: true },
    },
    responses: {
      200: jsonOf(ListingSchema, "The updated listing"),
      ...unauthorized,
      ...forbidden,
      ...notFound,
    },
  }),
  async (c) => {
    const user = await requireDbUser(c);
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const db = getDb();

    const [listing] = await db
      .select({
        id: directoryListings.id,
        ownerUserId: directoryListings.ownerUserId,
      })
      .from(directoryListings)
      .where(eq(directoryListings.id, id));
    if (!listing) throw new HTTPException(404, { message: "Listing not found" });

    const isAdmin = user.role === "admin";
    const isOwner = listing.ownerUserId === user.id;
    if (!isAdmin && !isOwner) {
      throw new HTTPException(403, { message: "Not your listing" });
    }
    if ((body.status !== undefined || body.verified !== undefined) && !isAdmin) {
      throw new HTTPException(403, {
        message: "Only admins can change status or verification",
      });
    }

    const [updated] = await db
      .update(directoryListings)
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.sector !== undefined ? { sector: body.sector } : {}),
        ...(body.listingType !== undefined ? { listingType: body.listingType } : {}),
        ...(body.tags !== undefined ? { tags: body.tags } : {}),
        ...(body.address !== undefined ? { address: body.address } : {}),
        ...(body.city !== undefined ? { city: body.city } : {}),
        ...(body.province !== undefined ? { province: body.province } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.verified !== undefined ? { verified: body.verified } : {}),
        ...(body.lat !== undefined && body.lng !== undefined
          ? { location: ewktPoint(body.lng, body.lat) }
          : {}),
        updatedAt: sql`now()`,
      })
      .where(eq(directoryListings.id, id))
      .returning(listingSelection);

    searchProvider.index(updated.id).catch((err) =>
      console.warn("[directory] index failed", err),
    );

    return c.json(serialize(updated), 200);
  },
);
