import { Resource } from "sst";
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { corridors, directoryListings } from "../db/schema/index";

/**
 * Mirror the platform's own database content into the knowledge corpus so
 * the chatbot can answer questions about live data — corridors and
 * published directory listings — not just uploaded documents.
 *
 * Everything lives under the `platform/` prefix, one markdown doc per
 * entity plus a Bedrock metadata sidecar. The sync is a full
 * reconciliation: write every current entity, delete docs whose entity no
 * longer qualifies (unpublished, archived, removed). Run an ingestion job
 * afterward to push the changes into the vector store.
 */
const PLATFORM_PREFIX = "platform/";

let s3: S3Client | null = null;
function getS3(): S3Client {
  if (!s3) s3 = new S3Client({});
  return s3;
}

function bucket(): string {
  return Resource.CorpusBucket.name;
}

interface CorpusDoc {
  key: string;
  body: string;
  metadata: Record<string, unknown>;
}

function corridorDoc(c: typeof corridors.$inferSelect): CorpusDoc {
  const metrics = Object.entries(c.metrics ?? {})
    .map(([k, v]) => `- ${k}: ${JSON.stringify(v)}`)
    .join("\n");
  const body = [
    `# Corridor: ${c.name}`,
    "",
    c.operator ? `Operated by ${c.operator}.` : null,
    c.description ?? null,
    metrics ? `\n## Corridor metrics\n\n${metrics}` : null,
    "",
    `The interactive corridor page is at /corridors/${c.slug}.`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
  return {
    key: `${PLATFORM_PREFIX}corridors/${c.slug}.md`,
    body,
    metadata: { kind: "corridor", slug: c.slug, name: c.name },
  };
}

function listingDoc(l: typeof directoryListings.$inferSelect): CorpusDoc {
  const place = [l.address, l.city, l.province].filter(Boolean).join(", ");
  const body = [
    `# ${l.name}`,
    "",
    `Directory listing in the ${l.sector} sector${l.verified ? " (verified)" : ""}.`,
    place ? `Located at ${place}.` : null,
    l.description ?? null,
    l.tags.length ? `Tags: ${l.tags.join(", ")}` : null,
    "",
    `The listing page is at /directory/${l.slug}.`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
  return {
    key: `${PLATFORM_PREFIX}listings/${l.slug}.md`,
    body,
    metadata: {
      kind: "listing",
      slug: l.slug,
      sector: l.sector,
      verified: l.verified,
    },
  };
}

async function listExistingKeys(): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const res = await getS3().send(
      new ListObjectsV2Command({
        Bucket: bucket(),
        Prefix: PLATFORM_PREFIX,
        ContinuationToken: token,
      }),
    );
    for (const o of res.Contents ?? []) {
      if (o.Key) keys.push(o.Key);
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

export interface PlatformSyncResult {
  written: number;
  deleted: number;
}

export async function syncPlatformContent(): Promise<PlatformSyncResult> {
  const db = getDb();
  const [allCorridors, publishedListings] = await Promise.all([
    db.select().from(corridors),
    db
      .select()
      .from(directoryListings)
      .where(eq(directoryListings.status, "published")),
  ]);

  const docs: CorpusDoc[] = [
    ...allCorridors.map(corridorDoc),
    ...publishedListings.map(listingDoc),
  ];

  const desired = new Set(
    docs.flatMap((d) => [d.key, `${d.key}.metadata.json`]),
  );

  const client = getS3();
  for (const doc of docs) {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket(),
        Key: doc.key,
        Body: doc.body,
        ContentType: "text/markdown",
      }),
    );
    await client.send(
      new PutObjectCommand({
        Bucket: bucket(),
        Key: `${doc.key}.metadata.json`,
        Body: JSON.stringify({ metadataAttributes: doc.metadata }),
        ContentType: "application/json",
      }),
    );
  }

  const stale = (await listExistingKeys()).filter((k) => !desired.has(k));
  for (const key of stale) {
    await client.send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
  }

  return {
    written: docs.length,
    // Count documents, not sidecars, for a human-meaningful number.
    deleted: stale.filter((k) => !k.endsWith(".metadata.json")).length,
  };
}
