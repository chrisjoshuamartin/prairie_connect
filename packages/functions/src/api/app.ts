import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { authMiddleware } from "./middleware/auth";
import { meRoutes } from "./routes/me";
import { directoryRoutes } from "./routes/directory";
import { searchRoutes } from "./routes/search";
import { corridorRoutes } from "./routes/corridors";
import { routeRoutes } from "./routes/routes";
import { chatRoutes } from "./routes/chat";
import { realtimeRoutes } from "./routes/realtime";
import type { AppEnv } from "./types";

export const app = new OpenAPIHono<AppEnv>({
  // Zod validation failures -> structured 422 instead of Hono's default 400
  defaultHook: (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: "Validation failed",
          issues: result.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
        422,
      );
    }
  },
});

app.use(logger());
app.use("/v1/*", authMiddleware);

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  console.error("[api] unhandled error", err);
  return c.json({ error: "Internal server error" }, 500);
});

// --- Routes -----------------------------------------------------------

app.openapi(
  createRoute({
    method: "get",
    path: "/health",
    tags: ["Meta"],
    summary: "Health check",
    responses: {
      200: {
        content: {
          "application/json": { schema: z.object({ ok: z.boolean() }) },
        },
        description: "Service is up",
      },
    },
  }),
  (c) => c.json({ ok: true }, 200),
);

app.route("/", meRoutes);
app.route("/", directoryRoutes);
app.route("/", searchRoutes);
app.route("/", corridorRoutes);
app.route("/", routeRoutes);
app.route("/", chatRoutes);
app.route("/", realtimeRoutes);

// --- OpenAPI / Swagger -------------------------------------------------

app.openAPIRegistry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
  description:
    "Cognito JWT (id or access token). Sign in against the Cognito User Pool (see stack outputs userPoolId / userPoolClientId) and paste the token here.",
});

export const openApiConfig = {
  openapi: "3.1.0",
  info: {
    title: "Prairie Connect API",
    version: "0.1.0",
    description: [
      "API for the Prairie Connect rail logistics platform — directory/marketplace,",
      "universal search, corridor atlas, route finder, and the AI guide.",
      "",
      "**Auth**: integrate directly with the Cognito User Pool (Amplify Auth or",
      "amazon-cognito-identity-js) and send the resulting JWT as a Bearer token.",
      "",
      "**Realtime**: fetch `/v1/realtime/token` for the MQTT-over-WSS config;",
      "chat replies stream there as `{type: delta|action|done}` events.",
      "",
      "**Chatbot UI actions**: assistant replies carry an `actions` array (see the",
      "`UiAction` schema) the client should execute — show a map, navigate, draw a",
      "route, open directory results.",
    ].join("\n"),
  },
} as const;

app.doc31("/openapi.json", openApiConfig);
app.get("/docs", swaggerUI({ url: "/openapi.json" }));
app.get("/", (c) => c.redirect("/docs"));
