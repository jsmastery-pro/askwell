import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  transpilePackages: ["@askwell/shared", "@askwell/db"],
  agentRules: false,
};

export default nextConfig;
