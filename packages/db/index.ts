// Database package: the Supabase types for the public schema.
//
// types.ts is exactly what the Supabase type generator emits for the schema
// in supabase/migrations. Regenerate it with the Supabase MCP's type generator
// in the same PR as any migration that changes the schema (`pnpm db:types` is
// still a placeholder). schema.test.ts checks it against the migrated schema.
//
// The pglite test helper is NOT exported here. It is test-only and lives at
// the "@askwell/db/testing" subpath (supabase-pglite.ts), so app code that
// imports from "@askwell/db" can never pull in pglite or node:fs.
export * from "./types";
