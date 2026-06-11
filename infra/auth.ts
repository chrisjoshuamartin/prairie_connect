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

export const userPoolClient = userPool.addClient("WebClient", {
  transform: {
    client: {
      explicitAuthFlows: [
        "ALLOW_USER_PASSWORD_AUTH",
        "ALLOW_REFRESH_TOKEN_AUTH",
        "ALLOW_USER_SRP_AUTH",
      ],
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
