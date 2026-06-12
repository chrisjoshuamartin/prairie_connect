import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { corridors, railLines } from "../db/schema/index";
import { slugify } from "../rail/import";

export async function corridorSlugTaken(slug: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: corridors.id })
    .from(corridors)
    .where(eq(corridors.slug, slug));
  return !!row;
}

/** Pick a free corridor slug, appending -2, -3, … when the base is taken. */
export async function ensureUniqueCorridorSlug(base: string): Promise<string> {
  const normalized = slugify(base) || base;
  let candidate = normalized;
  let n = 2;
  while (await corridorSlugTaken(candidate)) {
    candidate = `${normalized}-${n}`;
    n++;
  }
  return candidate;
}

export async function findCorridorForRailLine(
  railLineId: string,
): Promise<{ id: string; slug: string } | null> {
  const [row] = await getDb()
    .select({ id: corridors.id, slug: corridors.slug })
    .from(corridors)
    .where(eq(corridors.railLineId, railLineId));
  return row ?? null;
}

/**
 * Corridor slug when the client omits one: `{railLineSlug}-corridor` (unique)
 * when built around a rail line, otherwise slugify(name) (unique).
 */
export async function deriveCorridorSlug(input: {
  name: string;
  railLineId?: string;
}): Promise<string> {
  if (input.railLineId) {
    const [line] = await getDb()
      .select({ slug: railLines.slug })
      .from(railLines)
      .where(eq(railLines.id, input.railLineId));
    if (line) {
      return ensureUniqueCorridorSlug(`${line.slug}-corridor`);
    }
  }
  return ensureUniqueCorridorSlug(input.name);
}
