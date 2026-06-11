import { createRoute, z } from "@hono/zod-openapi";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@prairie-connect/core/db/client";
import {
  leads,
  users,
  LEAD_STATUSES,
} from "@prairie-connect/core/db/schema/index";
import { requireRole } from "../middleware/auth";
import { CreateLeadSchema, LeadSchema } from "../schemas";
import {
  createRouter,
  jsonOf,
  unauthorized,
  forbidden,
  bearerSecurity,
} from "../openapi";

export const leadRoutes = createRouter();

type LeadRow = typeof leads.$inferSelect;

function serialize(row: LeadRow) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    organization: row.organization ?? undefined,
    phone: row.phone ?? undefined,
    message: row.message ?? undefined,
    intent: row.intent ?? undefined,
    relatedListingId: row.relatedListingId ?? undefined,
    relatedCorridorId: row.relatedCorridorId ?? undefined,
    relatedRouteId: row.relatedRouteId ?? undefined,
    sourcePage: row.sourcePage ?? undefined,
    userId: row.userId,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

leadRoutes.openapi(
  createRoute({
    method: "post",
    path: "/v1/leads",
    tags: ["Leads"],
    summary: "Capture a lead",
    description:
      'Inquiry capture for every "contact this railway / transload / ask about this route / request an opportunity pack" action. No auth required — anonymous visitors can submit; if a Bearer token is present the lead is attributed to that user.',
    request: {
      body: { content: { "application/json": { schema: CreateLeadSchema } }, required: true },
    },
    responses: {
      201: jsonOf(
        z.object({ id: z.string(), status: z.string() }),
        "Lead captured",
      ),
    },
  }),
  async (c) => {
    const body = c.req.valid("json");
    const auth = c.get("auth");

    const [row] = await getDb()
      .insert(leads)
      .values({
        name: body.name,
        email: body.email,
        organization: body.organization,
        phone: body.phone,
        message: body.message,
        intent: body.intent,
        relatedListingId: body.relatedListingId,
        relatedCorridorId: body.relatedCorridorId,
        relatedRouteId: body.relatedRouteId,
        sourcePage: body.sourcePage,
        userId: auth ? await resolveUserId(auth.sub) : null,
      })
      .returning({ id: leads.id, status: leads.status });

    return c.json({ id: row.id, status: row.status }, 201);
  },
);

async function resolveUserId(cognitoSub: string): Promise<string | null> {
  const [user] = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.cognitoSub, cognitoSub));
  return user?.id ?? null;
}

leadRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/admin/leads",
    tags: ["Leads"],
    summary: "List captured leads (admin)",
    security: bearerSecurity,
    request: {
      query: z.object({
        status: z.enum(LEAD_STATUSES).optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
        offset: z.coerce.number().int().min(0).default(0),
      }),
    },
    responses: {
      200: jsonOf(z.array(LeadSchema), "Leads, newest first"),
      ...unauthorized,
      ...forbidden,
    },
  }),
  async (c) => {
    await requireRole(c, ["admin"]);
    const { status, limit, offset } = c.req.valid("query");

    const db = getDb();
    const rows = status
      ? await db
          .select()
          .from(leads)
          .where(eq(leads.status, status))
          .orderBy(desc(leads.createdAt))
          .limit(limit)
          .offset(offset)
      : await db
          .select()
          .from(leads)
          .orderBy(desc(leads.createdAt))
          .limit(limit)
          .offset(offset);

    return c.json(rows.map(serialize), 200);
  },
);

leadRoutes.openapi(
  createRoute({
    method: "patch",
    path: "/v1/admin/leads/{id}",
    tags: ["Leads"],
    summary: "Update lead status (admin)",
    security: bearerSecurity,
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: {
        content: {
          "application/json": {
            schema: z
              .object({ status: z.enum(LEAD_STATUSES) })
              .openapi("UpdateLeadStatus"),
          },
        },
        required: true,
      },
    },
    responses: {
      200: jsonOf(LeadSchema, "The updated lead"),
      ...unauthorized,
      ...forbidden,
      404: jsonOf(z.object({ error: z.string() }), "Lead not found"),
    },
  }),
  async (c) => {
    await requireRole(c, ["admin"]);
    const { id } = c.req.valid("param");
    const { status } = c.req.valid("json");

    const [row] = await getDb()
      .update(leads)
      .set({ status })
      .where(eq(leads.id, id))
      .returning();
    if (!row) return c.json({ error: "Lead not found" }, 404);
    return c.json(serialize(row), 200);
  },
);
