import { api } from "./api";
import { userPool, userPoolClient, authDomain, googleLoginEnabled } from "./auth";

/**
 * Internal admin tooling (Next.js on OpenNext). It's a pure client of the
 * REST API — no direct database access — so authorization stays in one
 * place: the API's `requireRole("admin")` checks. Sign-in goes through the
 * same Cognito User Pool as the public client.
 *
 * Set DEPLOY_ADMIN=false in .env(.stage) to skip it on `sst deploy` — e.g.
 * while the AWS account is pending CloudFront verification. `sst dev` always
 * keeps the component so the local Next.js dev server runs (no CloudFront is
 * created in dev mode anyway).
 */
const deployAdmin = $dev || process.env.DEPLOY_ADMIN !== "false";

export const admin = !deployAdmin
  ? undefined
  : new sst.aws.Nextjs("Admin", {
      path: "packages/admin",
      environment: {
        NEXT_PUBLIC_COGNITO_USER_POOL_ID: userPool.id,
        NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID: userPoolClient.id,
        // Hosted-UI domain for OAuth (Google). The deployed admin URL must be
        // listed in AUTH_CALLBACK_URLS / AUTH_LOGOUT_URLS (see infra/auth.ts) —
        // it can't be linked automatically without a circular dependency.
        NEXT_PUBLIC_AUTH_DOMAIN: authDomain,
        NEXT_PUBLIC_GOOGLE_LOGIN_ENABLED: googleLoginEnabled ? "true" : "false",
        API_URL: api.url,
      },
      server: {
        runtime: "nodejs22.x",
      },
    });
