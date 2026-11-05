import type { NextConfig } from "next";
import { ingestRewrites } from "./lib/analytics/hosts";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Workspace packages ship TypeScript source; Next compiles them.
  transpilePackages: ["@askwell/shared", "@askwell/db"],
  // PostHog's /ingest reverse proxy (lib/analytics/hosts.ts). Its API paths
  // end in "/", which Next would otherwise redirect away.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return ingestRewrites(process.env.NEXT_PUBLIC_POSTHOG_HOST);
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
