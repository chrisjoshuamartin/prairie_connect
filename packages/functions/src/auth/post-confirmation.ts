import type { PostConfirmationTriggerHandler } from "aws-lambda";
import { ensureUser } from "@prairie-connect/core/users/ensure";

/**
 * Cognito post-confirmation trigger: create the user row as soon as the
 * email is verified (or on first federated sign-in, e.g. Google), so the
 * first API call already has a DB identity. The very first user in the
 * system is created as admin (see ensureUser).
 * Failures must not block sign-up — the API's requireDbUser falls back to
 * creating the row on first authenticated request.
 */
export const handler: PostConfirmationTriggerHandler = async (event) => {
  const { sub, email, name } = event.request.userAttributes;
  if (!sub || !email) return event;

  try {
    await ensureUser({ cognitoSub: sub, email, name: name || null });
  } catch (err) {
    console.error("[post-confirmation] failed to create user row", err);
  }

  return event;
};
