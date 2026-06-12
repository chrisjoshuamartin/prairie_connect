import { database } from "./database";
import { userPool, userPoolClient } from "./auth";
import { realtimePublish } from "./realtime";
import { corpusBucket, assetsBucket } from "./storage";
import { ai } from "./ai";

/**
 * The public REST API: a single Hono app Lambda behind API Gateway v2.
 * Auth is enforced inside the app (aws-jwt-verify against the Cognito
 * JWKS) rather than with a gateway JWT authorizer, because several routes
 * are intentionally public (search, directory browse, /docs, /openapi.json)
 * and others accept-but-don't-require a token.
 */
export const api = new sst.aws.ApiGatewayV2("Api", {
  cors: {
    allowOrigins: ["*"],
    allowHeaders: ["authorization", "content-type"],
    allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  },
});

api.route("$default", {
  handler: "packages/functions/src/api/index.handler",
  link: [database, userPool, userPoolClient, realtimePublish, corpusBucket, assetsBucket, ai],
  timeout: "30 seconds",
  memory: "1024 MB",
  environment: {
    // Optional: enables real road routing for truck legs in the route
    // planner (set in .env.<stage>). Empty = straight-line estimates.
    GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY ?? "",
  },
});
