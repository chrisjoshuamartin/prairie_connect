import type { PostConfirmationTriggerHandler } from "aws-lambda";
import { getDb } from "@prairie-connect/core/db/client";
import { users } from "@prairie-connect/core/db/schema/index";

/**
 * Cognito post-confirmation trigger: create the user row as soon as the
 * email is verified, so the first API call already has a DB identity.
 * Failures must not block sign-up — the API's requireDbUser falls back to
 * creating the row on first authenticated request.
 */
export const handler: PostConfirmationTriggerHandler = async (event) => {
  const { sub, email, name } = event.request.userAttributes;
  if (!sub || !email) return event;

  try {
    await getDb()
      .insert(users)
      .values({ cognitoSub: sub, email, name: name || null })
      .onConflictDoNothing({ target: users.cognitoSub });
  } catch (err) {
    console.error("[post-confirmation] failed to create user row", err);
  }

  return event;
};
