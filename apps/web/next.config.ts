import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  transpilePackages: ["@askwell/shared", "@askwell/db"],
  agentRules: false,
  async headers() {
    return [
      // Clickjacking (project.md §9): only the widget panel may be framed by other sites.
      {
        source: "/:path((?!embed(?:/|$)).*)",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
      {
        source: "/embed",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }],
      },
      // Short cache so loader updates reach customer sites within minutes.
      {
        source: "/widget.js",
        headers: [{ key: "Cache-Control", value: "public, max-age=300" }],
      },
    ];
  },
};

export default nextConfig;
