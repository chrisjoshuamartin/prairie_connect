import { Resource } from "sst";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { railLines } from "../db/schema/index";

const LOGO_PREFIX = "logos/";
const UPLOAD_URL_TTL_SECONDS = 900;

const ALLOWED_LOGO_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);

let s3: S3Client | null = null;
function getS3(): S3Client {
  if (!s3) s3 = new S3Client({});
  return s3;
}

function bucket(): string {
  return Resource.AssetsBucket.name;
}

/** Public HTTPS URL for an object in the public assets bucket. */
export function logoPublicUrl(key: string): string {
  const region = process.env.AWS_REGION ?? "ca-central-1";
  return `https://${bucket()}.s3.${region}.amazonaws.com/${key}`;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

export function isLogoKeyForRailLine(key: string, railLineId: string): boolean {
  return key.startsWith(`${LOGO_PREFIX}${railLineId}/`);
}

export interface LogoUploadUrlInput {
  railLineId: string;
  filename: string;
  contentType: string;
}

export async function createRailLineLogoUploadUrl(
  input: LogoUploadUrlInput,
): Promise<{ key: string; url: string; expiresIn: number; logoUrl: string }> {
  if (!ALLOWED_LOGO_TYPES.has(input.contentType)) {
    throw new Error(
      "Logo must be PNG, JPEG, WebP, or SVG (image/png, image/jpeg, image/webp, image/svg+xml)",
    );
  }

  const db = getDb();
  const existing = await db
    .select({ id: railLines.id })
    .from(railLines)
    .where(eq(railLines.id, input.railLineId));
  if (!existing[0]) {
    throw new Error("Rail line not found");
  }

  const key = `${LOGO_PREFIX}${input.railLineId}/${Date.now()}-${sanitizeFilename(input.filename)}`;
  const url = await getSignedUrl(
    getS3(),
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      ContentType: input.contentType,
    }),
    { expiresIn: UPLOAD_URL_TTL_SECONDS },
  );

  return { key, url, expiresIn: UPLOAD_URL_TTL_SECONDS, logoUrl: logoPublicUrl(key) };
}

export async function setRailLineLogo(
  railLineId: string,
  logoKey: string,
): Promise<{ logoKey: string; logoUrl: string }> {
  if (!isLogoKeyForRailLine(logoKey, railLineId)) {
    throw new Error("Invalid logo key for this rail line");
  }

  const db = getDb();
  const [row] = await db
    .select({ logoKey: railLines.logoKey })
    .from(railLines)
    .where(eq(railLines.id, railLineId));
  if (!row) throw new Error("Rail line not found");

  const oldKey = row.logoKey;
  await db
    .update(railLines)
    .set({ logoKey })
    .where(eq(railLines.id, railLineId));

  if (oldKey && oldKey !== logoKey) {
    try {
      await getS3().send(
        new DeleteObjectCommand({ Bucket: bucket(), Key: oldKey }),
      );
    } catch (err) {
      console.warn("[rail/logos] failed to delete old logo", oldKey, err);
    }
  }

  return { logoKey, logoUrl: logoPublicUrl(logoKey) };
}

export async function deleteRailLineLogo(
  railLineId: string,
): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({ logoKey: railLines.logoKey })
    .from(railLines)
    .where(eq(railLines.id, railLineId));
  if (!row) throw new Error("Rail line not found");

  await db
    .update(railLines)
    .set({ logoKey: null })
    .where(eq(railLines.id, railLineId));

  if (row.logoKey) {
    try {
      await getS3().send(
        new DeleteObjectCommand({ Bucket: bucket(), Key: row.logoKey }),
      );
    } catch (err) {
      console.warn("[rail/logos] failed to delete logo", row.logoKey, err);
    }
  }
}

/** Best-effort S3 cleanup when a rail line is deleted. */
export async function deleteLogoObject(key: string | null): Promise<void> {
  if (!key) return;
  try {
    await getS3().send(
      new DeleteObjectCommand({ Bucket: bucket(), Key: key }),
    );
  } catch (err) {
    console.warn("[rail/logos] failed to delete logo object", key, err);
  }
}
