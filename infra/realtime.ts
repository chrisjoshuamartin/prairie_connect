import { userPool, userPoolClient } from "./auth";

/**
 * Managed WebSockets via AWS IoT Core (MQTT over WSS). The browser fetches
 * connection config from `GET /v1/realtime/token` and connects with its
 * Cognito JWT; the custom authorizer verifies the token against the pool's
 * JWKS and scopes the connection to the user's own topic subtree.
 */
export const realtime = new sst.aws.Realtime("Realtime", {
  authorizer: {
    handler: "packages/functions/src/realtime/authorizer.handler",
    link: [userPool, userPoolClient],
  },
});

/**
 * Server-side publish permission for the realtime/IoT endpoint. Linking
 * `realtime` itself grants the client (connect/subscribe) side; this
 * Linkable adds the `iot:Publish` IAM the API Lambda needs to push chat
 * stream chunks and notifications.
 */
export const realtimePublish = new sst.Linkable("RealtimePublish", {
  properties: {
    endpoint: realtime.endpoint,
    authorizer: realtime.authorizer,
  },
  include: [
    sst.aws.permission({
      actions: ["iot:Publish", "iot:DescribeEndpoint"],
      resources: ["*"],
    }),
  ],
});
