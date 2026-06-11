import { Resource } from "sst";
import type { Context, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { eq } from "drizzle-orm";
import { getDb } from "@prairie-connect/core/db/client";
import { users, type UserRole } from "@prairie-connect/core/db/schema/index";
import type { AppEnv, AuthClaims } from "../types";

// Lazy so the module is importable without an SST context (OpenAPI export).
function createVerifier() {
  return CognitoJwtVerifier.create({
    userPoolId: Resource.UserPool.id,
    // Accept both id and access tokens: `aud` (id) or `client_id`
    // (access) is checked against the web client either way.
    tokenUse: null,
    clientId: Resource.WebClient.id,
  });
}

let verifier: ReturnType<typeof createVerifier> | null = null;

function getVerifier() {
  if (!verifier) verifier = createVerifier();
  return verifier;
}

/**
 * Verifies the Bearer token when present and stashes the claims. A missing
 * token is fine (public routes); a present-but-invalid token is a hard 401
 * so clients learn about expired tokens immediately rather than acting as
 * anonymous.
 */
export const authMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const header = c.req.header("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) {
    const token = header.slice(7).trim();
    try {
      const claims = await getVerifier().verify(token);
      c.set("auth", {
        sub: claims.sub,
        email: typeof claims.email === "string" ? claims.email : undefined,
        token,
      });
    } catch {
      throw new HTTPException(401, { message: "Invalid or expired token" });
    }
  }
  await next();
};

export function requireAuth(c: Context<AppEnv>): AuthClaims {
  const auth = c.get("auth");
  if (!auth) {
    throw new HTTPException(401, { message: "Authentication required" });
  }
  return auth;
}

/**
 * Resolve (or lazily create) the DB user for the verified identity. The
 * post-confirmation trigger normally creates the row; this is the safety
 * net for users who predate it or whose trigger failed.
 */
export async function requireDbUser(c: Context<AppEnv>) {
  const auth = requireAuth(c);
  const db = getDb();
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.cognitoSub, auth.sub));
  if (existing[0]) return existing[0];

  await db
    .insert(users)
    .values({ cognitoSub: auth.sub, email: auth.email ?? "" })
    .onConflictDoNothing({ target: users.cognitoSub });
  const created = await db
    .select()
    .from(users)
    .where(eq(users.cognitoSub, auth.sub));
  if (!created[0]) {
    throw new HTTPException(500, { message: "Failed to resolve user" });
  }
  return created[0];
}

export async function requireRole(c: Context<AppEnv>, roles: UserRole[]) {
  const user = await requireDbUser(c);
  if (!roles.includes(user.role)) {
    throw new HTTPException(403, { message: "Insufficient permissions" });
  }
  return user;
}
