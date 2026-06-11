import { describe, expect, it } from "vitest";
import {
  uiActionSchema,
  UI_ACTIONS,
} from "@prairie-connect/core/chat/actions";

describe("UI action protocol", () => {
  it("accepts a valid show_map action", () => {
    const result = uiActionSchema.safeParse({
      type: "show_map",
      payload: { center: [-106.6, 52.1], zoom: 8, layers: ["corridor:gw"] },
    });
    expect(result.success).toBe(true);
  });

  it("applies payload defaults", () => {
    const result = uiActionSchema.parse({
      type: "show_map",
      payload: { center: [-106.6, 52.1] },
    });
    if (result.type !== "show_map") throw new Error("wrong type");
    expect(result.payload.zoom).toBe(8);
    expect(result.payload.layers).toEqual([]);
  });

  it("rejects unknown action types", () => {
    const result = uiActionSchema.safeParse({
      type: "self_destruct",
      payload: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejects malformed payloads", () => {
    const result = uiActionSchema.safeParse({
      type: "navigate",
      payload: { path: 42 },
    });
    expect(result.success).toBe(false);
  });

  it("every registered action has a unique type", () => {
    const types = UI_ACTIONS.map((a) => a.shape.type.value);
    expect(new Set(types).size).toBe(types.length);
  });
});
