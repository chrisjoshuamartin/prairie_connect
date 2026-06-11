import { createRoute } from "@hono/zod-openapi";
import { requireDbUser } from "../middleware/auth";
import { UserSchema } from "../schemas";
import { createRouter, jsonOf, unauthorized, bearerSecurity } from "../openapi";
import type { AppEnv } from "../types";

export const meRoutes = createRouter();

meRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/me",
    tags: ["Auth"],
    summary: "Current user profile",
    security: bearerSecurity,
    responses: {
      200: jsonOf(UserSchema, "The authenticated user"),
      ...unauthorized,
    },
  }),
  async (c) => {
    const user = await requireDbUser(c);
    return c.json(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt.toISOString(),
      },
      200,
    );
  },
);
