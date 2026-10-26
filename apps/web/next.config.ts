import path from "node:path";
import type { NextConfig } from "next";

// Rewrites are fixed at build time: default to the project's US region if the env var isn't set yet.
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
const posthogAssetsHost = posthogHost.replace(/^https:\/\/(\w+)\.i\.posthog\.com$/, "https://$1-assets.i.posthog.com");

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, "../.."),
  transpilePackages: ["@askwell/shared", "@askwell/db"],
  agentRules: false,
  // posthog-js POSTs to trailing-slash paths (/ingest/e/); Next's default 308 would break them.
  skipTrailingSlashRedirect: true,
  // PostHog through our own origin, so ad-blockers don't drop analytics requests.
  async rewrites() {
    return [
      { source: "/ingest/static/:path*", destination: `${posthogAssetsHost}/static/:path*` },
      { source: "/ingest/:path*", destination: `${posthogHost}/:path*` },
    ];
  },
  async headers() {
    return [
      // Clickjacking (project.md §9): only the widget panel, exactly /embed, may be framed by other sites.
      // Everything else, /embed/ and /embed/… included, is same-origin only. Next makes a trailing
      // slash optional on both sources, so /embed/ matches both: the same-origin rule comes last,
      // so its CSP is the one /embed/ ends up with.
      {
        source: "/embed",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }],
      },
      {
        source: "/:path((?!embed$).*)",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
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
