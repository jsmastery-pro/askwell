// Database package: the Supabase types for the public schema.
//
// types.ts is exactly what the Supabase type generator emits for the schema
// in supabase/migrations. Regenerate it with the Supabase MCP's type generator
// in the same PR as any migration that changes the schema (`pnpm db:types` is
// still a placeholder). schema.test.ts checks it against the migrated schema.
// Never hand-edit it: corrections the generator can't express go in the
// override below (Supabase's MergeDeep pattern, without the type-fest dep).
//
// The pglite test helper is NOT exported here. It is test-only and lives at
// the "@askwell/db/testing" subpath (supabase-pglite.ts), so app code that
// imports from "@askwell/db" can never pull in pglite or node:fs.
import type { Database as GeneratedDatabase } from "./types";

export type { CompositeTypes, Enums, Json, Tables, TablesInsert, TablesUpdate } from "./types";
export { Constants } from "./types";

/** Flattens an intersection into one object type, as type-fest's MergeDeep output is. */
type Simplify<T> = { [K in keyof T]: T[K] } & {};

/** `Base` with `Override`'s keys replaced (one level). */
type Merge<Base, Override> = Simplify<Omit<Base, keyof Override> & Override>;

type GeneratedPublic = GeneratedDatabase["public"];
type GeneratedReserve = GeneratedPublic["Functions"]["reserve_knowledge_source"];

/**
 * The generator types every function argument and RETURNS TABLE column as
 * non-null. reserve_knowledge_source takes and returns a null storage key for
 * pasted text (knowledge_sources.storage_key is nullable).
 */
type ReserveKnowledgeSource = Merge<
  GeneratedReserve,
  {
    Args: Merge<GeneratedReserve["Args"], { p_storage_key: string | null }>;
    Returns: Merge<GeneratedReserve["Returns"][number], { storage_key: string | null }>[];
  }
>;

/** The generated Database with the overrides above. Use this, never the generated one. */
export type Database = Merge<
  GeneratedDatabase,
  {
    public: Merge<
      GeneratedPublic,
      { Functions: Merge<GeneratedPublic["Functions"], { reserve_knowledge_source: ReserveKnowledgeSource }> }
    >;
  }
>;
