import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { fetchWithWakeRetry } from "../retry";

export interface Me {
  id: string;
  email: string;
  name: string | null;
  role: "member" | "operator" | "edo" | "admin";
  createdAt: string;
}

let verifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null;

function getVerifier() {
  // Lazy so `next build` doesn't need Cognito env vars at module load.
  verifier ??= CognitoJwtVerifier.create({
    userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID!,
    clientId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID!,
    tokenUse: "id",
  });
  return verifier;
}

/**
 * The verified Cognito ID token from the Amplify session cookie, or null.
 * Anything that fails signature/expiry verification counts as no token —
 * never trust a decoded-but-unverified payload.
 */
export async function getIdToken(): Promise<string | null> {
  const jar = await cookies();
  const idTokenCookies = jar
    .getAll()
    .filter(
      (cookie) =>
        cookie.name.endsWith(".idToken") &&
        (cookie.name.includes("CognitoIdentityServiceProvider") ||
          cookie.name.includes("amplify-")),
    );

  for (const cookie of idTokenCookies) {
    try {
      await getVerifier().verify(cookie.value);
      return cookie.value;
    } catch {
      // Invalid/expired token — try the next candidate cookie, if any.
    }
  }
  return null;
}

/**
 * Page guard: requires a verified session AND the `admin` role (roles live
 * in the platform database, so we ask the API). Call at the top of every
 * dashboard server page.
 */
export async function requireAdmin(): Promise<{ token: string; user: Me }> {
  const token = await getIdToken();
  if (!token) redirect("/login");

  const res = await fetchWithWakeRetry(`${process.env.API_URL}/v1/me`, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 401) redirect("/login");
  if (!res.ok) {
    throw new Error(
      `Failed to load profile (${res.status}). The database may still be waking from auto-pause — try refreshing in ~30 seconds.`,
    );
  }
  const user = (await res.json()) as Me;
  if (user.role !== "admin") redirect("/denied");
  return { token, user };
}
