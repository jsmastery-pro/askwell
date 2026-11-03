// Database package. Phase 1 adds the generated Supabase types (types.ts).
//
// The pglite test helper is NOT exported here. It is test-only and lives at
// the "@askwell/db/testing" subpath (supabase-pglite.ts), so app code that
// imports from "@askwell/db" can never pull in pglite or node:fs.
export {};
