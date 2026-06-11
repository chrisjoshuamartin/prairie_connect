/**
 * Pure helpers for the realtime (IoT) custom authorizer, split out from
 * `authorizer.ts` so they can be unit-tested without importing
 * `sst/aws/realtime` (which builds a Lambda handler at module load).
 */

import { topicPrefix, topics } from "@prairie-connect/core/realtime/topics";

// IoT enforces a hard 300s floor and 86400s ceiling on both
// refreshAfterInSeconds and disconnectAfterInSeconds. The refresh cap is
// policy: long enough to keep multi-tab sessions quiet, short enough that
// sign-out propagates within an hour.
export const IOT_FLOOR_SECONDS = 300;
export const IOT_CEILING_SECONDS = 86400;
export const REFRESH_CAP_SECONDS = 3600;

export function clampToIotBand(seconds: number): number {
  if (!Number.isFinite(seconds)) return IOT_FLOOR_SECONDS;
  return Math.max(IOT_FLOOR_SECONDS, Math.min(seconds, IOT_CEILING_SECONDS));
}

export interface AuthorizerResult {
  principalId?: string;
  refreshAfterInSeconds: number;
  disconnectAfterInSeconds?: number;
  subscribe?: string[];
}

/**
 * Build the authorizer response from verified token claims. Grants scope
 * the connection to exactly one subscribe filter — the user's own subtree
 * (`<app>/<stage>/user/<sub>/#`), which carries chat streams and
 * notifications addressed to them.
 *
 * CRITICAL: deny responses must omit `publish`/`subscribe` entirely (not
 * `[]`). SST's wrapper treats an empty array as truthy and emits a
 * malformed IAM policy that IoT rejects wholesale.
 */
export function buildAuthorizerResult(args: {
  sub: string | undefined;
  exp: number | undefined;
  appName: string;
  stage: string;
  nowMs?: number;
}): AuthorizerResult {
  const nowMs = args.nowMs ?? Date.now();
  const remainingSeconds =
    typeof args.exp === "number"
      ? Math.floor((args.exp * 1000 - nowMs) / 1000)
      : 0;

  if (!args.sub || remainingSeconds <= 0) {
    return { refreshAfterInSeconds: IOT_FLOOR_SECONDS };
  }

  const prefix = topicPrefix(args.appName, args.stage);
  return {
    // IoT enforces `[a-zA-Z0-9]{1,128}` — Cognito subs are UUIDs, so strip
    // the hyphens for a stable, identity-derived principal.
    principalId: args.sub.replace(/[^a-zA-Z0-9]/g, "").slice(0, 128),
    refreshAfterInSeconds: clampToIotBand(
      Math.min(remainingSeconds, REFRESH_CAP_SECONDS),
    ),
    disconnectAfterInSeconds: clampToIotBand(remainingSeconds),
    // Clients never publish — the backend pushes via the IoT data plane.
    subscribe: [topics.userScope(prefix, args.sub)],
  };
}
