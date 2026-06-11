import { eq, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { users } from "../db/schema/index";

export type UserRow = typeof users.$inferSelect;

export interface EnsureUserInput {
  cognitoSub: string;
  email: string;
  name?: string | null;
}

/**
 * Find-or-create the DB user for a Cognito identity. Called from the
 * post-confirmation trigger and (as a safety net) from the API's
 * requireDbUser.
 *
 * Bootstrap rule: the very first user in the system gets the `admin` role,
 * so a fresh deployment is administrable without manual SQL. The role is
 * decided inside the INSERT itself (CASE WHEN EXISTS) so two concurrent
 * first sign-ups can't both observe an empty table via separate queries.
 */
export async function ensureUser(input: EnsureUserInput): Promise<UserRow | null> {
  const db = getDb();

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.cognitoSub, input.cognitoSub));
  if (existing[0]) return existing[0];

  await db
    .insert(users)
    .values({
      cognitoSub: input.cognitoSub,
      email: input.email,
      name: input.name ?? null,
      role: sql`CASE WHEN EXISTS (SELECT 1 FROM users) THEN 'member' ELSE 'admin' END` as unknown as "member",
    })
    .onConflictDoNothing({ target: users.cognitoSub });

  const created = await db
    .select()
    .from(users)
    .where(eq(users.cognitoSub, input.cognitoSub));
  return created[0] ?? null;
}
