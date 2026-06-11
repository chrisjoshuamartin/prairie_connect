import { realtime } from "sst/aws/realtime";
import { Resource } from "sst";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { buildAuthorizerResult } from "./authorizer-lib";

/**
 * Realtime (IoT WebSocket) custom authorizer. The browser connects with its
 * Cognito JWT (config from `/v1/realtime/token`); we verify it against the
 * user pool's JWKS and scope the connection to the user's own topic
 * subtree. Accept both id and access tokens (`tokenUse: null`).
 */
const verifier = CognitoJwtVerifier.create({
  userPoolId: Resource.UserPool.id,
  tokenUse: null,
  clientId: Resource.WebClient.id,
});

export const handler = realtime.authorizer(async (token) => {
  let sub: string | undefined;
  let exp: number | undefined;
  let outcome = "deny:no-token";

  if (token) {
    try {
      const claims = await verifier.verify(token);
      sub = claims.sub;
      exp = claims.exp;
      outcome = "allow";
    } catch (err) {
      outcome = "deny:verify-failed";
      console.warn(
        `[realtime-auth] token verification failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  const result = buildAuthorizerResult({
    sub,
    exp,
    appName: Resource.App.name,
    stage: Resource.App.stage,
  });
  if (outcome === "allow" && !result.subscribe) {
    outcome = "deny:expired";
  }

  console.log(
    `[realtime-auth] ${outcome} sub=${(sub ?? "-").slice(0, 8)} exp=${exp ?? "-"}`,
  );

  return result;
});
