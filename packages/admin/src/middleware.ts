import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const AUTH_ROUTES = ["/login", "/auth/callback"];
const SESSION_COOKIE_PATTERNS = ["CognitoIdentityServiceProvider", "amplify-"];

/**
 * Cheap session check for routing only — expiry is read from the (unverified)
 * token payload. Real verification happens server-side in lib/auth/guard.ts
 * and ultimately in the API itself.
 */
function hasValidSession(request: NextRequest): boolean {
  const cookies = request.cookies.getAll();
  const sessionCookies = cookies.filter((cookie) =>
    SESSION_COOKIE_PATTERNS.some((pattern) => cookie.name.includes(pattern)),
  );
  if (sessionCookies.length === 0) return false;

  const idToken = sessionCookies.find((c) => c.name.endsWith(".idToken"));
  if (!idToken) return false;

  try {
    const payload = JSON.parse(
      Buffer.from(idToken.value.split(".")[1], "base64url").toString(),
    );
    if (typeof payload.exp === "number" && payload.exp * 1000 < Date.now()) {
      return false;
    }
  } catch {
    return false;
  }

  return true;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route));
  const isAuthenticated = hasValidSession(request);

  if (!isAuthRoute && !isAuthenticated) {
    const response = NextResponse.redirect(
      new URL(`/login?from=${encodeURIComponent(pathname)}`, request.url),
      { status: 303 },
    );
    response.headers.set("x-middleware-cache", "no-cache");
    for (const cookie of request.cookies.getAll()) {
      if (SESSION_COOKIE_PATTERNS.some((p) => cookie.name.includes(p))) {
        response.cookies.delete(cookie.name);
      }
    }
    return response;
  }

  if (isAuthRoute && isAuthenticated) {
    const response = NextResponse.redirect(new URL("/dashboard", request.url), {
      status: 303,
    });
    response.headers.set("x-middleware-cache", "no-cache");
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
