import { z } from "@hono/zod-openapi";
import {
  SECTORS,
  LISTING_STATUSES,
  LISTING_TYPES,
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

export const AdminUsersPageSchema = z
  .object({
    items: z.array(UserSchema),
    total: z.number(),
    page: z.number(),
    pageSize: z.number(),
  })
  .openapi("AdminUsersPage");

export const ListingSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    description: z.string().nullable(),
    sector: z.enum(SECTORS),
    listingType: z.enum(LISTING_TYPES),
    tags: z.array(z.string()),
    address: z.string().nullable(),
    city: z.string().nullable(),
    province: z.string().nullable(),
    lat: z.number().nullable(),
    lng: z.number().nullable(),
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
    listingType: z
      .enum(LISTING_TYPES)
      .default("other")
      .describe("Physical site type (transload, port, terminal, ...)"),
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
    /** The rail line the corridor is built around (admin endpoints only). */
    railLineId: z.string().nullable().optional(),
    metrics: z.record(z.string(), z.unknown()),
    createdAt: z.string(),
  })
  .openapi("Corridor");

export const CreateCorridorSchema = z
  .object({
    name: z.string().min(2).max(200),
    slug: z
      .string()
      .min(2)
      .max(100)
      .regex(/^[a-z0-9-]+$/)
      .optional()
      .describe("Derived from the name when omitted"),
    operator: z.string().max(200).optional(),
    description: z.string().max(5000).optional(),
    railLineId: z
      .string()
      .uuid()
      .optional()
      .describe(
        "Build the corridor around this rail line: geometry is copied from it and its rail graph is tagged with the corridor",
      ),
    metrics: z.record(z.string(), z.unknown()).optional(),
  })
  .openapi("CreateCorridor");

export const UpdateCorridorSchema = CreateCorridorSchema.partial()
  .extend({
    railLineId: z
      .string()
      .uuid()
      .nullable()
      .optional()
      .describe("Set to relink (geometry is re-copied) or null to detach"),
  })
  .openapi("UpdateCorridor");

export const RailLineSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    operator: z.string().nullable(),
    description: z.string().nullable(),
    sourceName: z.string().nullable(),
    logoKey: z.string().nullable(),
    logoUrl: z.string().nullable().describe("Public URL when a logo is set"),
    edgeCount: z.number().describe("Routing graph edges derived from this line"),
    totalLengthKm: z.number(),
    createdAt: z.string(),
  })
  .openapi("RailLine");

export const RailLineLogoUploadUrlSchema = z
  .object({
    filename: z.string().min(1).max(200),
    contentType: z
      .string()
      .min(1)
      .max(200)
      .describe("image/png | image/jpeg | image/webp | image/svg+xml"),
  })
  .openapi("RailLineLogoUploadUrlRequest");

export const RailLineLogoUploadUrlResponseSchema = z
  .object({
    key: z.string().describe("S3 key — send back in PATCH after PUT succeeds"),
    url: z.string().describe("Presigned PUT URL"),
    expiresIn: z.number(),
    logoUrl: z.string().describe("Public URL the logo will be served from"),
  })
  .openapi("RailLineLogoUploadUrlResponse");

export const SetRailLineLogoSchema = z
  .object({
    logoKey: z.string().min(1).max(500),
  })
  .openapi("SetRailLineLogo");

export const RailLineDetailSchema = RailLineSchema.extend({
  /** GeoJSON MultiLineString of the full line geometry. */
  geometry: z.record(z.string(), z.unknown()).nullable(),
}).openapi("RailLineDetail");

export const ImportRailLineSchema = z
  .object({
    name: z.string().min(2).max(200),
    slug: z
      .string()
      .min(2)
      .max(100)
      .regex(/^[a-z0-9-]+$/)
      .optional()
      .describe("Derived from the name when omitted"),
    operator: z.string().max(200).optional(),
    description: z.string().max(5000).optional(),
    geojson: z
      .union([z.record(z.string(), z.unknown()), z.string()])
      .describe(
        "GeoJSON FeatureCollection, Feature, LineString, or MultiLineString (object or JSON string). Non-line features are ignored.",
      ),
    sourceName: z.string().max(300).optional().describe("Original filename, for provenance"),
    buildGraph: z
      .boolean()
      .default(true)
      .describe("Also derive rail_nodes / rail_edges for the routing engine"),
    snapToleranceM: z
      .number()
      .min(0)
      .max(5000)
      .default(150)
      .describe(
        "Segment endpoints within this distance (metres) of an existing node reuse it — stitches lines into one routable network",
      ),
  })
  .openapi("ImportRailLine");

export const ImportRailLineResultSchema = z
  .object({
    railLineId: z.string(),
    slug: z.string(),
    segmentCount: z.number().describe("LineStrings found in the source GeoJSON"),
    nodesCreated: z.number(),
    nodesReused: z.number().describe("Endpoints snapped onto existing nodes"),
    edgesCreated: z.number(),
    totalLengthKm: z.number(),
  })
  .openapi("ImportRailLineResult");

export const UpdateRailLineSchema = z
  .object({
    name: z.string().min(2).max(200).optional(),
    slug: z
      .string()
      .min(2)
      .max(100)
      .regex(/^[a-z0-9-]+$/)
      .optional(),
    operator: z.string().max(200).nullable().optional(),
    description: z.string().max(5000).nullable().optional(),
    geojson: z
      .union([z.record(z.string(), z.unknown()), z.string()])
      .optional()
      .describe(
        "Replace geometry from GeoJSON; clears and rebuilds the derived routing graph by default",
      ),
    sourceName: z.string().max(300).optional(),
    rebuildGraph: z
      .boolean()
      .default(true)
      .describe("When geojson is provided, rebuild rail_nodes / rail_edges"),
    snapToleranceM: z.number().min(0).max(5000).default(150).optional(),
  })
  .openapi("UpdateRailLine");

export const UpdateRailLineResultSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    operator: z.string().nullable(),
    description: z.string().nullable(),
    geometryUpdated: z.boolean(),
    graphRebuilt: z
      .object({
        segmentCount: z.number(),
        nodesCreated: z.number(),
        nodesReused: z.number(),
        edgesCreated: z.number(),
        totalLengthKm: z.number(),
      })
      .nullable(),
  })
  .openapi("UpdateRailLineResult");

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

export const PlanSiteSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    listingType: z.string(),
    city: z.string().nullable(),
    province: z.string().nullable(),
    lat: z.number(),
    lng: z.number(),
  })
  .openapi("PlanSite");

export const PlanLegSchema = z
  .object({
    seq: z.number(),
    mode: z.enum(["truck", "rail"]),
    from: z.object({ label: z.string(), lat: z.number(), lng: z.number() }),
    to: z.object({ label: z.string(), lat: z.number(), lng: z.number() }),
    distanceKm: z.number(),
    source: z
      .enum(["road", "estimate"])
      .optional()
      .describe(
        "Truck legs only: road = Google Directions route, estimate = straight line × circuity factor",
      ),
    durationMinutes: z
      .number()
      .nullable()
      .optional()
      .describe("Truck legs only: drive time when routed on roads"),
    railDetail: z
      .object({
        segments: z.array(RouteSegmentSchema),
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
      .optional()
      .describe("Present on rail legs only"),
  })
  .openapi("PlanLeg");

export const PlanOptionsSchema = z
  .object({
    useYardConnectors: z
      .boolean()
      .default(true)
      .describe(
        "Allow yard/spur/siding/crossover trackage as cost-penalized connectors; off restricts routing to Main/Connecting/Wye trackage",
      ),
    yardCostFactor: z
      .number()
      .min(1)
      .max(100)
      .default(5)
      .describe("Cost multiplier for connector trackage"),
    preferSingleOperator: z
      .boolean()
      .default(false)
      .describe(
        "Penalize railways other than the one serving the chosen origin site, approximating interchange cost",
      ),
    operatorPenaltyFactor: z
      .number()
      .min(1)
      .max(100)
      .default(2)
      .describe("Cost multiplier for non-preferred operators"),
    truckCostFactor: z
      .number()
      .min(1)
      .max(10)
      .default(3)
      .describe(
        "How much more a truck-km costs than a rail-km when scoring candidate site pairs; higher values favour longer rail and shorter drayage",
      ),
    siteCandidates: z
      .number()
      .int()
      .min(1)
      .max(3)
      .default(1)
      .describe(
        "Candidate sites per endpoint; all pairs are evaluated and the cheapest door-to-door plan wins",
      ),
  })
  .openapi("PlanRouteOptions");

export const PlanRouteResultSchema = z
  .object({
    legs: z.array(PlanLegSchema).describe("Ordered truck → rail → truck legs"),
    originSite: PlanSiteSchema.describe("Rail-served site nearest the origin"),
    destinationSite: PlanSiteSchema.describe("Rail-served site nearest the destination"),
    totalDistanceKm: z.number(),
    truckDistanceKm: z.number(),
    railDistanceKm: z.number(),
    preferredOperator: z
      .string()
      .nullable()
      .describe("Operator the rail leg was biased toward (preferSingleOperator)"),
    evaluatedPairs: z.number().describe("Site pairs evaluated for this plan"),
    geometry: z
      .record(z.string(), z.unknown())
      .describe(
        "GeoJSON FeatureCollection of every leg; features carry a `mode` property (truck | rail edge modes)",
      ),
  })
  .openapi("PlanRouteResult");

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

export const KnowledgeDocumentSchema = z
  .object({
    key: z.string(),
    size: z.number(),
    lastModified: z.string().nullable(),
  })
  .openapi("KnowledgeDocument");

export const AddKnowledgeTextSchema = z
  .object({
    title: z.string().min(1).max(200),
    content: z.string().min(1).max(100000),
    tags: z.array(z.string()).max(20).optional(),
    source: z.string().max(500).optional(),
  })
  .openapi("AddKnowledgeText");

export const UploadUrlRequestSchema = z
  .object({
    filename: z.string().min(1).max(200),
    contentType: z.string().min(1).max(200),
  })
  .openapi("UploadUrlRequest");

export const UploadUrlResponseSchema = z
  .object({
    key: z.string().describe("S3 key the file will live at"),
    url: z.string().describe("Presigned PUT URL — upload the file body here"),
    expiresIn: z.number().describe("URL validity in seconds"),
  })
  .openapi("UploadUrlResponse");

export const IngestionJobSchema = z
  .object({
    jobId: z.string(),
    status: z
      .string()
      .describe("STARTING | IN_PROGRESS | COMPLETE | FAILED | ..."),
    statistics: z.record(z.string(), z.unknown()).optional(),
  })
  .openapi("IngestionJob");

export const PlatformSyncResultSchema = z
  .object({
    written: z.number().describe("Documents exported to the corpus"),
    deleted: z.number().describe("Stale documents removed"),
    ingestion: IngestionJobSchema.nullable().describe(
      "The ingestion job if one was started (null when ingest=false)",
    ),
  })
  .openapi("PlatformSyncResult");

export const PlacementTargetingSchema = z
  .object({
    pages: z.array(z.string().max(50)).max(10).default([]),
    sectors: z.array(z.enum(SECTORS)).max(10).default([]),
    regions: z.array(z.string().max(10)).max(10).default([]),
    corridors: z.array(z.string().max(100)).max(30).default([]),
    intents: z.array(z.string().max(100)).max(30).default([]),
    listingTypes: z.array(z.string().max(50)).max(10).default([]),
  })
  .openapi("PlacementTargeting");

export const PlacementSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    imageUrl: z.string().nullable(),
    linkUrl: z.string().nullable(),
    listingId: z.string().nullable(),
    corridorId: z.string().nullable(),
    weight: z.number(),
  })
  .openapi("FeaturedPlacement");

export const AdminPlacementSchema = PlacementSchema.extend({
  targeting: PlacementTargetingSchema,
  active: z.boolean(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  createdAt: z.string(),
}).openapi("AdminFeaturedPlacement");

export const CreatePlacementSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    imageUrl: z.string().url().optional(),
    linkUrl: z.string().max(500).optional(),
    listingId: z.string().uuid().optional(),
    corridorId: z.string().uuid().optional(),
    targeting: PlacementTargetingSchema.optional(),
    weight: z.number().int().default(0),
    active: z.boolean().default(true),
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().optional(),
  })
  .openapi("CreateFeaturedPlacement");

export const IntentConfigSchema = z
  .object({
    searchTerms: z.array(z.string().max(100)).max(20).default([]),
    defaultFilters: z
      .object({
        sector: z.enum(SECTORS).optional(),
        q: z.string().max(200).optional(),
      })
      .optional(),
    destinationPath: z.string().max(300).optional(),
    ctas: z
      .array(z.object({ label: z.string().max(80), path: z.string().max(300) }))
      .max(10)
      .default([]),
    guidedQuestions: z.array(z.string().max(300)).max(20).default([]),
    aiPrompts: z.array(z.string().max(300)).max(10).default([]),
    relatedCorridorSlugs: z.array(z.string().max(100)).max(30).default([]),
  })
  .openapi("IntentConfig");

export const IntentSummarySchema = z
  .object({
    slug: z.string(),
    title: z.string(),
    intro: z.string().nullable(),
    icon: z.string().nullable(),
    sortOrder: z.number(),
    config: IntentConfigSchema,
  })
  .openapi("Intent");

export const IntentDetailSchema = IntentSummarySchema.extend({
  relatedCorridors: z.array(CorridorSchema),
  relatedListings: z.array(ListingSchema),
  suggestedRoutes: z.array(SavedRouteSchema).describe("Curated routes"),
  featuredPlacements: z.array(PlacementSchema),
}).openapi("IntentDetail");

export const UpsertIntentSchema = z
  .object({
    title: z.string().min(1).max(200),
    intro: z.string().max(2000).optional(),
    icon: z.string().max(50).optional(),
    sortOrder: z.number().int().default(0),
    active: z.boolean().default(true),
    config: IntentConfigSchema.default({
      searchTerms: [],
      ctas: [],
      guidedQuestions: [],
      aiPrompts: [],
      relatedCorridorSlugs: [],
    }),
  })
  .openapi("UpsertIntent");

export const CreateLeadSchema = z
  .object({
    name: z.string().min(1).max(200),
    email: z.string().email().max(320),
    organization: z.string().max(200).optional(),
    phone: z.string().max(50).optional(),
    message: z.string().max(5000).optional(),
    intent: z.string().max(100).optional(),
    relatedListingId: z.string().uuid().optional(),
    relatedCorridorId: z.string().uuid().optional(),
    relatedRouteId: z.string().uuid().optional(),
    sourcePage: z.string().max(300).optional(),
  })
  .openapi("CreateLead");

export const LeadSchema = CreateLeadSchema.extend({
  id: z.string(),
  status: z.enum(["new", "contacted", "qualified", "closed"]),
  userId: z.string().nullable(),
  createdAt: z.string(),
}).openapi("Lead");

export const AnalyticsEventSchema = z
  .object({
    type: z
      .string()
      .min(1)
      .max(100)
      .describe(
        "e.g. intent_selected, search_performed, listing_viewed, corridor_viewed, route_generated, partner_card_clicked, contact_button_clicked, ai_prompt_used, document_downloaded",
      ),
    payload: z.record(z.string(), z.unknown()).default({}),
    sessionId: z.string().max(100).optional(),
    page: z.string().max(300).optional(),
  })
  .openapi("AnalyticsEvent");

export const AnalyticsBatchSchema = z
  .object({
    events: z.array(AnalyticsEventSchema).min(1).max(50),
  })
  .openapi("AnalyticsBatch");

export const MapLayerSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    kind: z.enum(["line", "point", "polygon"]),
    status: z.enum(["available", "planned"]),
    defaultVisible: z.boolean(),
    source: z.object({
      type: z.enum(["geojson-api", "none"]),
      hint: z.string().optional(),
    }),
  })
  .openapi("MapLayer");

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
