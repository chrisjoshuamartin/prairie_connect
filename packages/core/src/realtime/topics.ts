/**
 * IoT topic scheme. Everything a user can hear lives under their own
 * subtree — the realtime authorizer grants exactly one subscribe filter
 * (`<app>/<stage>/user/<sub>/#`), so a connection can never observe
 * another user's chat stream or notifications.
 */
export function topicPrefix(appName: string, stage: string): string {
  return `${appName}/${stage}`;
}

export const topics = {
  /** Subscribe filter granted by the authorizer — the user's whole subtree. */
  userScope: (prefix: string, sub: string) => `${prefix}/user/${sub}/#`,
  /** General notifications (listing verified, route shared, etc.). */
  notifications: (prefix: string, sub: string) =>
    `${prefix}/user/${sub}/notifications`,
  /** Streaming chatbot output for one conversation. */
  chat: (prefix: string, sub: string, conversationId: string) =>
    `${prefix}/user/${sub}/chat/${conversationId}`,
};

/** Payload shapes published on the chat topic while a reply streams. */
export type ChatStreamEvent =
  | { type: "delta"; text: string }
  | { type: "action"; action: unknown }
  | { type: "done"; messageId: string }
  | { type: "error"; message: string };
