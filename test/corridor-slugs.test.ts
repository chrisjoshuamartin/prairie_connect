import { describe, it, expect, vi, beforeEach } from "vitest";

const selectMock = vi.fn();

vi.mock("@prairie-connect/core/db/client", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => selectMock(),
      }),
    }),
  }),
}));

import {
  ensureUniqueCorridorSlug,
  deriveCorridorSlug,
} from "@prairie-connect/core/corridors/slugs";

describe("ensureUniqueCorridorSlug", () => {
  beforeEach(() => {
    selectMock.mockReset();
  });

  it("returns the base slug when free", async () => {
    selectMock.mockResolvedValueOnce([]);
    await expect(ensureUniqueCorridorSlug("great-western-corridor")).resolves.toBe(
      "great-western-corridor",
    );
  });

  it("appends -2 when the base slug is taken", async () => {
    selectMock
      .mockResolvedValueOnce([{ id: "existing" }])
      .mockResolvedValueOnce([]);
    await expect(ensureUniqueCorridorSlug("great-western-corridor")).resolves.toBe(
      "great-western-corridor-2",
    );
  });
});

describe("deriveCorridorSlug", () => {
  beforeEach(() => {
    selectMock.mockReset();
  });

  it("uses {railLineSlug}-corridor when built around a rail line", async () => {
    selectMock
      .mockResolvedValueOnce([{ slug: "gwr" }])
      .mockResolvedValueOnce([]);
    await expect(
      deriveCorridorSlug({ name: "Great Western Railway", railLineId: "line-1" }),
    ).resolves.toBe("gwr-corridor");
  });
});
