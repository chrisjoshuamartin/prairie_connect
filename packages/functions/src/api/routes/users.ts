import { createRoute, z } from "@hono/zod-openapi";
import { desc, sql } from "drizzle-orm";
import { getDb } from "@prairie-connect/core/db/client";
import { users } from "@prairie-connect/core/db/schema/index";
import { requireRole } from "../middleware/auth";
import { AdminUsersPageSchema } from "../schemas";
import {
  createRouter,
  jsonOf,
  unauthorized,
  forbidden,
  bearerSecurity,
} from "../openapi";

export const userRoutes = createRouter();

const usersQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

userRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/admin/users",
    tags: ["Users"],
    summary: "List users (admin, paged)",
    security: bearerSecurity,
    request: { query: usersQuery },
    responses: {
      200: jsonOf(AdminUsersPageSchema, "One page of users, newest first"),
      ...unauthorized,
      ...forbidden,
    },
  }),
  async (c) => {
    await requireRole(c, ["admin"]);
    const { page, pageSize } = c.req.valid("query");
    const db = getDb();

    const [items, [{ count }]] = await Promise.all([
      db
        .select()
        .from(users)
        .orderBy(desc(users.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db.select({ count: sql<number>`count(*)` }).from(users),
    ]);

    return c.json(
      {
        items: items.map((u) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          role: u.role,
          createdAt: u.createdAt.toISOString(),
        })),
        total: Number(count),
        page,
        pageSize,
      },
      200,
    );
  },
);
