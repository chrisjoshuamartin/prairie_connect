import { createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "@prairie-connect/core/db/client";
import {
  conversations,
  chatMessages,
} from "@prairie-connect/core/db/schema/index";
import { runChatTurn } from "@prairie-connect/core/chat/converse";
import { requireAuth, requireDbUser } from "../middleware/auth";
import { ChatRequestSchema, ChatResponseSchema, UiActionSchema } from "../schemas";
import { createRouter, jsonOf, unauthorized, notFound, bearerSecurity } from "../openapi";
import type { AppEnv } from "../types";

export const chatRoutes = createRouter();

const ConversationSchema = z
  .object({
    id: z.string(),
    title: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi("Conversation");

const ChatMessageSchema = z
  .object({
    id: z.string(),
    role: z.enum(["user", "assistant"]),
    content: z.string(),
    actions: z.array(UiActionSchema),
    createdAt: z.string(),
  })
  .openapi("ChatMessage");

chatRoutes.openapi(
  createRoute({
    method: "post",
    path: "/v1/chat/messages",
    tags: ["Chat"],
    summary: "Send a message to the assistant",
    description:
      "Runs one assistant turn. The reply streams live on the conversation's realtime topic (`<prefix>/user/<sub>/chat/<conversationId>` — deltas, then actions, then done); the full reply and validated UI actions are also returned here. Omit `conversationId` to start a new conversation.",
    security: bearerSecurity,
    request: {
      body: { content: { "application/json": { schema: ChatRequestSchema } }, required: true },
    },
    responses: {
      200: jsonOf(ChatResponseSchema, "The assistant's reply and UI actions"),
      ...unauthorized,
      ...notFound,
    },
  }),
  async (c) => {
    const auth = requireAuth(c);
    const user = await requireDbUser(c);
    const body = c.req.valid("json");
    const db = getDb();

    let conversationId = body.conversationId;
    if (conversationId) {
      const [conv] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, conversationId));
      if (!conv || conv.userId !== user.id) {
        throw new HTTPException(404, { message: "Conversation not found" });
      }
    } else {
      const [conv] = await db
        .insert(conversations)
        .values({ userId: user.id, title: body.message.slice(0, 80) })
        .returning();
      conversationId = conv.id;
    }

    const history = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, conversationId))
      .orderBy(asc(chatMessages.createdAt))
      .limit(20);

    await db.insert(chatMessages).values({
      conversationId,
      role: "user",
      content: body.message,
    });

    const result = await runChatTurn({
      sub: auth.sub,
      conversationId,
      message: body.message,
      history: history.map((m) => ({ role: m.role, content: m.content })),
    });

    const [assistantMessage] = await db
      .insert(chatMessages)
      .values({
        conversationId,
        role: "assistant",
        content: result.text,
        actions: result.actions,
      })
      .returning();

    return c.json(
      {
        conversationId,
        messageId: assistantMessage.id,
        message: result.text,
        actions: result.actions,
      },
      200,
    );
  },
);

chatRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/chat/conversations",
    tags: ["Chat"],
    summary: "List my conversations",
    security: bearerSecurity,
    responses: {
      200: jsonOf(z.array(ConversationSchema), "The user's conversations"),
      ...unauthorized,
    },
  }),
  async (c) => {
    const user = await requireDbUser(c);
    const list = await getDb()
      .select()
      .from(conversations)
      .where(eq(conversations.userId, user.id))
      .orderBy(desc(conversations.createdAt));
    return c.json(
      list.map((conv) => ({
        id: conv.id,
        title: conv.title,
        createdAt: conv.createdAt.toISOString(),
      })),
      200,
    );
  },
);

chatRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/chat/conversations/{id}",
    tags: ["Chat"],
    summary: "Get a conversation's messages",
    security: bearerSecurity,
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      200: jsonOf(z.array(ChatMessageSchema), "Messages, oldest first"),
      ...unauthorized,
      ...notFound,
    },
  }),
  async (c) => {
    const user = await requireDbUser(c);
    const { id } = c.req.valid("param");
    const db = getDb();
    const [conv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id));
    if (!conv || conv.userId !== user.id) {
      throw new HTTPException(404, { message: "Conversation not found" });
    }
    const messages = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, id))
      .orderBy(asc(chatMessages.createdAt));
    return c.json(
      messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        actions: m.actions as any[],
        createdAt: m.createdAt.toISOString(),
      })),
      200,
    );
  },
);
