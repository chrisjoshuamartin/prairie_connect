import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Monorepo: keep file tracing rooted at the repo, not a parent lockfile.
  outputFileTracingRoot: path.join(__dirname, "../.."),
  experimental: {
    serverActions: {
      // Rail line GeoJSON imports flow through a server action.
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
