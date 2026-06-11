import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@prairie-connect/core": fileURLToPath(
        new URL("./packages/core/src", import.meta.url),
      ),
      "@prairie-connect/functions": fileURLToPath(
        new URL("./packages/functions/src", import.meta.url),
      ),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
  },
});
