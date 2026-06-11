import { createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import {
  addKnowledgeText,
  createUploadUrl,
  listDocuments,
  deleteDocument,
  startIngestion,
  getIngestion,
  KnowledgeNotConfiguredError,
} from "@prairie-connect/core/ai/knowledge";
import { syncPlatformContent } from "@prairie-connect/core/ai/platform-sync";
import { requireRole } from "../middleware/auth";
import {
  AddKnowledgeTextSchema,
  KnowledgeDocumentSchema,
  UploadUrlRequestSchema,
  UploadUrlResponseSchema,
  IngestionJobSchema,
  PlatformSyncResultSchema,
} from "../schemas";
import {
  createRouter,
  jsonOf,
  unauthorized,
  forbidden,
  conflict,
  bearerSecurity,
} from "../openapi";
import type { AppEnv } from "../types";

export const knowledgeRoutes = createRouter();

function handleKbError(err: unknown): never {
  if (err instanceof KnowledgeNotConfiguredError) {
    throw new HTTPException(409, { message: err.message });
  }
  throw err;
}

knowledgeRoutes.openapi(
  createRoute({
    method: "post",
    path: "/v1/admin/knowledge/text",
    tags: ["Knowledge Base"],
    summary: "Add a text knowledge snippet",
    description:
      "Stores authored text as a markdown document in the corpus. Call the sync endpoint afterward (or batch several adds, then sync once) to ingest it into the vector store.",
    security: bearerSecurity,
    request: {
      body: { content: { "application/json": { schema: AddKnowledgeTextSchema } }, required: true },
    },
    responses: {
      201: jsonOf(z.object({ key: z.string() }), "Stored; key in the corpus bucket"),
      ...unauthorized,
      ...forbidden,
    },
  }),
  async (c) => {
    await requireRole(c, ["admin"]);
    const body = c.req.valid("json");
    const result = await addKnowledgeText(body);
    return c.json(result, 201);
  },
);

knowledgeRoutes.openapi(
  createRoute({
    method: "post",
    path: "/v1/admin/knowledge/uploads",
    tags: ["Knowledge Base"],
    summary: "Get a presigned upload URL for a file",
    description:
      "Returns a presigned PUT URL. Upload the file bytes directly to it (PDF, docx, txt, md). Then call the sync endpoint to ingest. The same Content-Type must be sent on the PUT.",
    security: bearerSecurity,
    request: {
      body: { content: { "application/json": { schema: UploadUrlRequestSchema } }, required: true },
    },
    responses: {
      200: jsonOf(UploadUrlResponseSchema, "Presigned upload URL"),
      ...unauthorized,
      ...forbidden,
    },
  }),
  async (c) => {
    await requireRole(c, ["admin"]);
    const body = c.req.valid("json");
    return c.json(await createUploadUrl(body), 200);
  },
);

knowledgeRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/admin/knowledge/documents",
    tags: ["Knowledge Base"],
    summary: "List corpus documents",
    security: bearerSecurity,
    request: {
      query: z.object({
        prefix: z
          .string()
          .optional()
          .describe("Filter by key prefix, e.g. 'knowledge/' or 'uploads/'"),
      }),
    },
    responses: {
      200: jsonOf(z.array(KnowledgeDocumentSchema), "Documents in the corpus"),
      ...unauthorized,
      ...forbidden,
    },
  }),
  async (c) => {
    await requireRole(c, ["admin"]);
    const { prefix } = c.req.valid("query");
    return c.json(await listDocuments(prefix), 200);
  },
);

knowledgeRoutes.openapi(
  createRoute({
    method: "delete",
    path: "/v1/admin/knowledge/documents",
    tags: ["Knowledge Base"],
    summary: "Delete a corpus document",
    description:
      "Removes the object (and its metadata sidecar). Run a sync afterward so the vector store drops the chunks.",
    security: bearerSecurity,
    request: {
      query: z.object({ key: z.string().min(1) }),
    },
    responses: {
      204: { description: "Deleted" },
      ...unauthorized,
      ...forbidden,
    },
  }),
  async (c) => {
    await requireRole(c, ["admin"]);
    const { key } = c.req.valid("query");
    await deleteDocument(key);
    return c.body(null, 204);
  },
);

knowledgeRoutes.openapi(
  createRoute({
    method: "post",
    path: "/v1/admin/knowledge/sync",
    tags: ["Knowledge Base"],
    summary: "Start an ingestion job",
    description:
      "Triggers a Bedrock ingestion job that (re)chunks and embeds the corpus into the Aurora vector store. Returns the job id to poll. Returns 409 if the Knowledge Base isn't configured yet.",
    security: bearerSecurity,
    responses: {
      202: jsonOf(IngestionJobSchema, "Ingestion job started"),
      ...unauthorized,
      ...forbidden,
      ...conflict,
    },
  }),
  async (c) => {
    await requireRole(c, ["admin"]);
    try {
      return c.json(await startIngestion(), 202);
    } catch (err) {
      handleKbError(err);
    }
  },
);

knowledgeRoutes.openapi(
  createRoute({
    method: "post",
    path: "/v1/admin/knowledge/sync-platform",
    tags: ["Knowledge Base"],
    summary: "Export platform data into the knowledge corpus",
    description:
      "Mirrors live platform content — all corridors and published directory listings — into the corpus as markdown documents (under `platform/`), removing docs for entities that no longer qualify. By default also starts an ingestion job so the chatbot picks up the changes; pass `?ingest=false` to export only.",
    security: bearerSecurity,
    request: {
      query: z.object({
        ingest: z
          .enum(["true", "false"])
          .default("true")
          .describe("Start a Bedrock ingestion job after exporting"),
      }),
    },
    responses: {
      202: jsonOf(PlatformSyncResultSchema, "Export counts + ingestion job"),
      ...unauthorized,
      ...forbidden,
      ...conflict,
    },
  }),
  async (c) => {
    await requireRole(c, ["admin"]);
    const { ingest } = c.req.valid("query");
    const result = await syncPlatformContent();
    let ingestion = null;
    if (ingest !== "false") {
      try {
        ingestion = await startIngestion();
      } catch (err) {
        handleKbError(err);
      }
    }
    return c.json({ ...result, ingestion }, 202);
  },
);

knowledgeRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/admin/knowledge/sync/{jobId}",
    tags: ["Knowledge Base"],
    summary: "Get ingestion job status",
    security: bearerSecurity,
    request: { params: z.object({ jobId: z.string() }) },
    responses: {
      200: jsonOf(IngestionJobSchema, "Ingestion job status + statistics"),
      ...unauthorized,
      ...forbidden,
      ...conflict,
    },
  }),
  async (c) => {
    await requireRole(c, ["admin"]);
    const { jobId } = c.req.valid("param");
    try {
      return c.json(await getIngestion(jobId), 200);
    } catch (err) {
      handleKbError(err);
    }
  },
);
