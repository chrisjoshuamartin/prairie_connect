import { OpenAPIHono, type z } from "@hono/zod-openapi";
import { ErrorSchema } from "./schemas";
import type { AppEnv } from "./types";

/**
 * Router factory: every route group must be created through this so the
 * validation defaultHook (structured 422s) applies — hooks set on the root
 * app do NOT propagate to mounted sub-routers.
 */
export function createRouter() {
  return new OpenAPIHono<AppEnv>({
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
}

/** Shorthand for a JSON response/request body in a createRoute definition. */
export function jsonOf<T extends z.ZodType>(schema: T, description: string) {
  return { content: { "application/json": { schema } }, description };
}

export const unauthorized = {
  401: jsonOf(ErrorSchema, "Missing or invalid Bearer token"),
};

export const forbidden = {
  403: jsonOf(ErrorSchema, "Insufficient permissions"),
};

export const notFound = {
  404: jsonOf(ErrorSchema, "Not found"),
};

export const conflict = {
  409: jsonOf(ErrorSchema, "Not configured / conflicting state"),
};

export const bearerSecurity = [{ bearerAuth: [] as string[] }];
