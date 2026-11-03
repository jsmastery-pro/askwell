// Database package. Phase 1 adds the generated Supabase types (types.ts).

// TEST-ONLY: the pglite helper. Never import it from apps/web runtime code
// (it loads a WASM Postgres and node:fs, and pglite is a devDependency).
// Tests import it from "@askwell/db"; app code only imports types from here.
export {
  applyMigrations,
  asRole,
  createTestDb,
  MIGRATIONS_DIR,
  type JwtClaims,
  type SupabaseRole,
} from "./supabase-pglite";
