import { defineConfig } from "vitest/config";

const EXCLUDE = ["**/node_modules/**", "**/.next/**", "**/dist/**"];

// One Vitest run from the root covers every workspace package, as two projects:
// - "db": the pglite tests in packages/db, one file at a time. Each file holds
//   one or two in-memory Postgres instances; run in parallel they can exceed a
//   4 GB sandbox and get the worker OOM-killed.
// - "unit": everything else, in parallel as before.
export default defineConfig({
  test: {
    exclude: EXCLUDE,
    projects: [
      {
        extends: true,
        test: {
          name: "db",
          include: ["packages/db/**/*.test.ts"],
          fileParallelism: false,
        },
      },
      {
        extends: true,
        test: {
          name: "unit",
          include: ["{apps,packages}/*/**/*.test.{ts,tsx}"],
          exclude: [...EXCLUDE, "packages/db/**"],
        },
      },
    ],
  },
});
