import { database } from "./database";

/**
 * Cognito User Pool — the frontend integrates with this directly (Amplify
 * Auth, amazon-cognito-identity-js, or the OAuth endpoints) using the
 * userPoolId / userPoolClientId stack outputs. The API only ever sees the
 * resulting JWT as a Bearer token.
 *
 * Email delivery uses Cognito's default sender for now; swap in an SES
 * identity (see bigbear's infra/auth.ts) once a domain is verified.
 */
export const userPool = new sst.aws.CognitoUserPool("UserPool", {
  usernames: ["email"],
  triggers: {
    postConfirmation: {
      handler: "packages/functions/src/auth/post-confirmation.handler",
      link: [database],
      timeout: "25 seconds",
    },
  },
});

/**
 * Social login (Google). Gated on env vars so the stack deploys before
 * Google OAuth credentials exist — set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
 * in .env.<stage> and redeploy to enable. Federated users get a normal
 * Cognito JWT, so the API needs no changes; the post-confirmation trigger
 * fires on first Google sign-in and creates the users row as usual.
 */
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

const googleProvider =
  googleClientId && googleClientSecret
    ? userPool.addIdentityProvider("Google", {
        type: "google",
        details: {
          authorize_scopes: "openid email profile",
          client_id: googleClientId,
          client_secret: googleClientSecret,
        },
        attributes: {
          email: "email",
          name: "name",
          username: "sub",
        },
      })
    : null;

/**
 * Where Cognito may redirect after hosted-UI / OAuth sign-in and sign-out.
 * Comma-separated env overrides for deployed frontends; localhost default
 * keeps local frontend dev working out of the box.
 */
const callbackUrls = (
  process.env.AUTH_CALLBACK_URLS ?? "http://localhost:3000/auth/callback"
).split(",");
const logoutUrls = (process.env.AUTH_LOGOUT_URLS ?? "http://localhost:3000").split(",");

export const userPoolClient = userPool.addClient("WebClient", {
  providers: googleProvider
    ? ["COGNITO", googleProvider.providerName]
    : ["COGNITO"],
  transform: {
    client: {
      explicitAuthFlows: [
        "ALLOW_USER_PASSWORD_AUTH",
        "ALLOW_REFRESH_TOKEN_AUTH",
        "ALLOW_USER_SRP_AUTH",
      ],
      // OAuth (authorization code + PKCE) for hosted UI and social logins.
      allowedOauthFlowsUserPoolClient: true,
      allowedOauthFlows: ["code"],
      allowedOauthScopes: ["openid", "email", "profile"],
      callbackUrls,
      logoutUrls,
      accessTokenValidity: 24,
      idTokenValidity: 24,
      refreshTokenValidity: 30,
      tokenValidityUnits: {
        accessToken: "hours",
        idToken: "hours",
        refreshToken: "days",
      },
    },
  },
});

/**
 * Hosted UI domain — hosts the OAuth endpoints (/oauth2/authorize, /token)
 * that social logins flow through. Prefix must be globally unique per region.
 */
const userPoolDomain = new aws.cognito.UserPoolDomain("UserPoolDomain", {
  domain: $interpolate`prairie-connect-${$app.stage}`,
  userPoolId: userPool.id,
});

export const authDomain = $interpolate`${userPoolDomain.domain}.auth.ca-central-1.amazoncognito.com`;
export const googleLoginEnabled = Boolean(googleProvider);
