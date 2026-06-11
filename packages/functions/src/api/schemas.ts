import { z } from "@hono/zod-openapi";
import {
  SECTORS,
  LISTING_STATUSES,
  USER_ROLES,
} from "@prairie-connect/core/db/schema/index";
import { uiActionSchema } from "@prairie-connect/core/chat/actions";

export const ErrorSchema = z
  .object({ error: z.string() })
  .openapi("Error");

export const UserSchema = z
  .object({
    id: z.string(),
    email: z.string(),
    name: z.string().nullable(),
    role: z.enum(USER_ROLES),
    createdAt: z.string(),
  })
  .openapi("User");

export const ListingSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    description: z.string().nullable(),
    sector: z.enum(SECTORS),
    tags: z.array(z.string()),
    address: z.string().nullable(),
    city: z.string().nullable(),
    province: z.string().nullable(),
    verified: z.boolean(),
    status: z.enum(LISTING_STATUSES),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("DirectoryListing");

export const CreateListingSchema = z
  .object({
    name: z.string().min(2).max(200),
    description: z.string().max(5000).optional(),
    sector: z.enum(SECTORS).default("other"),
    tags: z.array(z.string()).max(20).default([]),
    address: z.string().optional(),
    city: z.string().optional(),
    province: z.string().optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
  })
  .openapi("CreateDirectoryListing");

export const SearchHitSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    sector: z.string(),
    description: z.string().nullable(),
    city: z.string().nullable(),
    province: z.string().nullable(),
    verified: z.boolean(),
    score: z.number(),
    distanceKm: z.number().optional(),
  })
  .openapi("SearchHit");

export const CorridorSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    operator: z.string().nullable(),
    description: z.string().nullable(),
    metrics: z.record(z.string(), z.unknown()),
    createdAt: z.string(),
  })
  .openapi("Corridor");

export const CorridorDetailSchema = CorridorSchema.extend({
  /** GeoJSON MultiLineString of the corridor geometry (null if not loaded). */
  geometry: z.record(z.string(), z.unknown()).nullable(),
}).openapi("CorridorDetail");

export const RouteEndpointSchema = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    label: z.string().optional(),
  })
  .openapi("RouteEndpoint");

export const RouteSegmentSchema = z
  .object({
    seq: z.number(),
    edgeId: z.number().nullable(),
    mode: z.string(),
    operator: z.string().nullable(),
    fromNode: z.object({ id: z.number(), name: z.string().nullable() }),
    toNode: z.object({ id: z.number(), name: z.string().nullable() }),
    lengthKm: z.number().nullable(),
  })
  .openapi("RouteSegment");

export const RouteResultSchema = z
  .object({
    segments: z.array(RouteSegmentSchema),
    totalLengthKm: z.number(),
    geometry: z
      .record(z.string(), z.unknown())
      .describe("GeoJSON FeatureCollection of the route edges"),
    nearestOriginNode: z.object({
      id: z.number(),
      name: z.string().nullable(),
      distanceKm: z.number(),
    }),
    nearestDestinationNode: z.object({
      id: z.number(),
      name: z.string().nullable(),
      distanceKm: z.number(),
    }),
  })
  .openapi("RouteResult");

export const SavedRouteSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    origin: RouteEndpointSchema,
    destination: RouteEndpointSchema,
    segments: z.array(RouteSegmentSchema),
    geometry: z.record(z.string(), z.unknown()).nullable(),
    reverse: z.boolean(),
    curated: z.boolean(),
    createdAt: z.string(),
  })
  .openapi("SavedRoute");

/**
 * The chatbot UI-action protocol — every action the assistant can emit to
 * drive the frontend. Render each `type` however the client sees fit.
 */
export const UiActionSchema = uiActionSchema.openapi("UiAction");

export const ChatRequestSchema = z
  .object({
    conversationId: z
      .string()
      .uuid()
      .optional()
      .describe("Omit to start a new conversation"),
    message: z.string().min(1).max(4000),
  })
  .openapi("ChatRequest");

export const ChatResponseSchema = z
  .object({
    conversationId: z.string(),
    messageId: z.string(),
    message: z.string().describe("The assistant's text reply"),
    actions: z
      .array(UiActionSchema)
      .describe(
        "UI actions for the client to execute (show a map, navigate, draw a route...). Also streamed live on the conversation's realtime topic.",
      ),
  })
  .openapi("ChatResponse");

export const RealtimeConfigSchema = z
  .object({
    endpoint: z.string().describe("IoT WSS endpoint host"),
    authorizer: z.string().describe("IoT custom authorizer name"),
    topicPrefix: z.string(),
    topics: z.object({
      notifications: z.string(),
      chatPattern: z
        .string()
        .describe("Chat topic; replace {conversationId}"),
    }),
  })
  .openapi("RealtimeConfig");
