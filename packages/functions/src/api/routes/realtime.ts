import { Resource } from "sst";
import { createRoute } from "@hono/zod-openapi";
import { realtimePrefix } from "@prairie-connect/core/realtime/publish";
import { topics } from "@prairie-connect/core/realtime/topics";
import { requireAuth } from "../middleware/auth";
import { RealtimeConfigSchema } from "../schemas";
import { createRouter, jsonOf, unauthorized, bearerSecurity } from "../openapi";
import type { AppEnv } from "../types";

export const realtimeRoutes = createRouter();

realtimeRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/realtime/token",
    tags: ["Realtime"],
    summary: "WebSocket connection config",
    description:
      "Returns everything needed to open the MQTT-over-WSS connection: connect to `wss://<endpoint>/mqtt?x-amz-customauthorizer-name=<authorizer>` passing your Cognito JWT as the MQTT password (any username). Subscribe to the topics returned — the authorizer scopes you to your own subtree.",
    security: bearerSecurity,
    responses: {
      200: jsonOf(RealtimeConfigSchema, "Realtime connection config"),
      ...unauthorized,
    },
  }),
  async (c) => {
    const auth = requireAuth(c);
    const prefix = realtimePrefix();
    return c.json(
      {
        endpoint: Resource.RealtimePublish.endpoint,
        authorizer: Resource.RealtimePublish.authorizer,
        topicPrefix: prefix,
        topics: {
          notifications: topics.notifications(prefix, auth.sub),
          chatPattern: topics.chat(prefix, auth.sub, "{conversationId}"),
        },
      },
      200,
    );
  },
);
