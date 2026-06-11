import { Resource } from "sst";
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  BedrockAgentClient,
  StartIngestionJobCommand,
  GetIngestionJobCommand,
} from "@aws-sdk/client-bedrock-agent";

/**
 * Knowledge base content management.
 *
 * Documents live in the S3 corpus bucket; a Bedrock ingestion job chunks,
 * embeds, and writes them into the Aurora pgvector store the chatbot
 * retrieves from. Two prefixes keep things tidy:
 *   knowledge/  — text snippets authored through the API (written as .md)
 *   uploads/    — files (PDFs, docs) uploaded via presigned URL
 * Both are picked up by the same data source.
 */
const TEXT_PREFIX = "knowledge/";
const UPLOAD_PREFIX = "uploads/";
const UPLOAD_URL_TTL_SECONDS = 900;

let s3: S3Client | null = null;
function getS3(): S3Client {
  if (!s3) s3 = new S3Client({});
  return s3;
}

let agent: BedrockAgentClient | null = null;
function getAgent(): BedrockAgentClient {
  if (!agent) agent = new BedrockAgentClient({});
  return agent;
}

function bucket(): string {
  return Resource.CorpusBucket.name;
}

/** Thrown when ingestion is requested before the KB/data source are wired up. */
export class KnowledgeNotConfiguredError extends Error {
  readonly name = "KnowledgeNotConfiguredError";
  constructor() {
    super(
      "Knowledge Base not configured. Set KNOWLEDGE_BASE_ID and DATA_SOURCE_ID and redeploy.",
    );
  }
}

function requireKbConfig(): { knowledgeBaseId: string; dataSourceId: string } {
  const knowledgeBaseId = Resource.Ai.knowledgeBaseId;
  const dataSourceId = Resource.Ai.dataSourceId;
  if (!knowledgeBaseId || !dataSourceId) throw new KnowledgeNotConfiguredError();
  return { knowledgeBaseId, dataSourceId };
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
}

export interface KnowledgeDocument {
  key: string;
  size: number;
  lastModified: string | null;
}

export interface AddTextInput {
  title: string;
  content: string;
  /** Optional metadata used for Bedrock metadata filtering (sidecar file). */
  tags?: string[];
  source?: string;
}

/**
 * Store an authored text snippet as a markdown object. If tags/source are
 * given, also write the Bedrock `<key>.metadata.json` sidecar so the
 * content can be filtered at retrieval time.
 */
export async function addKnowledgeText(
  input: AddTextInput,
): Promise<{ key: string }> {
  const key = `${TEXT_PREFIX}${Date.now()}-${slugify(input.title)}.md`;
  const body = `# ${input.title}\n\n${input.content}\n`;

  await getS3().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: "text/markdown",
    }),
  );

  if ((input.tags && input.tags.length) || input.source) {
    const metadata = {
      metadataAttributes: {
        ...(input.tags && input.tags.length ? { tags: input.tags } : {}),
        ...(input.source ? { source: input.source } : {}),
        title: input.title,
      },
    };
    await getS3().send(
      new PutObjectCommand({
        Bucket: bucket(),
        Key: `${key}.metadata.json`,
        Body: JSON.stringify(metadata),
        ContentType: "application/json",
      }),
    );
  }

  return { key };
}

export interface UploadUrlInput {
  filename: string;
  contentType: string;
}

/**
 * Presigned PUT URL so an admin/back-office can upload a file straight to
 * S3 without proxying bytes through the API. The URL is signed with the
 * Lambda's role, so the bucket needs no public access.
 */
export async function createUploadUrl(
  input: UploadUrlInput,
): Promise<{ key: string; url: string; expiresIn: number }> {
  const key = `${UPLOAD_PREFIX}${Date.now()}-${sanitizeFilename(input.filename)}`;
  const url = await getSignedUrl(
    getS3(),
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      ContentType: input.contentType,
    }),
    { expiresIn: UPLOAD_URL_TTL_SECONDS },
  );
  return { key, url, expiresIn: UPLOAD_URL_TTL_SECONDS };
}

export async function listDocuments(
  prefix?: string,
): Promise<KnowledgeDocument[]> {
  const res = await getS3().send(
    new ListObjectsV2Command({
      Bucket: bucket(),
      Prefix: prefix,
      MaxKeys: 1000,
    }),
  );
  return (res.Contents ?? [])
    // Hide the Bedrock metadata sidecars from the document listing.
    .filter((o) => o.Key && !o.Key.endsWith(".metadata.json"))
    .map((o) => ({
      key: o.Key!,
      size: o.Size ?? 0,
      lastModified: o.LastModified?.toISOString() ?? null,
    }));
}

export async function deleteDocument(key: string): Promise<void> {
  await getS3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
  // Best-effort: drop the sidecar too.
  await getS3()
    .send(
      new DeleteObjectCommand({
        Bucket: bucket(),
        Key: `${key}.metadata.json`,
      }),
    )
    .catch(() => undefined);
}

export interface IngestionJob {
  jobId: string;
  status: string;
  statistics?: Record<string, unknown>;
}

/** Kick off a Bedrock ingestion job to (re)sync the corpus into the vector store. */
export async function startIngestion(): Promise<IngestionJob> {
  const { knowledgeBaseId, dataSourceId } = requireKbConfig();
  const res = await getAgent().send(
    new StartIngestionJobCommand({ knowledgeBaseId, dataSourceId }),
  );
  return {
    jobId: res.ingestionJob?.ingestionJobId ?? "",
    status: res.ingestionJob?.status ?? "UNKNOWN",
  };
}

export async function getIngestion(jobId: string): Promise<IngestionJob> {
  const { knowledgeBaseId, dataSourceId } = requireKbConfig();
  const res = await getAgent().send(
    new GetIngestionJobCommand({
      knowledgeBaseId,
      dataSourceId,
      ingestionJobId: jobId,
    }),
  );
  return {
    jobId,
    status: res.ingestionJob?.status ?? "UNKNOWN",
    statistics: res.ingestionJob?.statistics as
      | Record<string, unknown>
      | undefined,
  };
}
