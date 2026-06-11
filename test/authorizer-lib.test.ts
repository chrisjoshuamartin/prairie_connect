import { describe, expect, it } from "vitest";
import {
  buildAuthorizerResult,
  IOT_FLOOR_SECONDS,
  REFRESH_CAP_SECONDS,
} from "@prairie-connect/functions/realtime/authorizer-lib";

const NOW = 1_700_000_000_000;
const SUB = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

describe("realtime authorizer", () => {
  it("denies without a sub (no subscribe key at all)", () => {
    const result = buildAuthorizerResult({
      sub: undefined,
      exp: NOW / 1000 + 3600,
      appName: "prairie-connect",
      stage: "dev",
      nowMs: NOW,
    });
    expect(result.refreshAfterInSeconds).toBe(IOT_FLOOR_SECONDS);
    expect("subscribe" in result).toBe(false);
  });

  it("denies an expired token", () => {
    const result = buildAuthorizerResult({
      sub: SUB,
      exp: NOW / 1000 - 10,
      appName: "prairie-connect",
      stage: "dev",
      nowMs: NOW,
    });
    expect(result.subscribe).toBeUndefined();
  });

  it("grants the user's own topic subtree only", () => {
    const result = buildAuthorizerResult({
      sub: SUB,
      exp: NOW / 1000 + 7200,
      appName: "prairie-connect",
      stage: "dev",
      nowMs: NOW,
    });
    expect(result.subscribe).toEqual([
      `prairie-connect/dev/user/${SUB}/#`,
    ]);
    expect(result.refreshAfterInSeconds).toBe(REFRESH_CAP_SECONDS);
    expect(result.principalId).toMatch(/^[a-zA-Z0-9]+$/);
  });
});
