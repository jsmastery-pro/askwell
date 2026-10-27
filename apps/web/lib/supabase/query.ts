import type { PostgrestError } from "@supabase/supabase-js";

/** A Supabase query error as a thrown Error, keeping its Postgres code for callers that map it. */
export class SupabaseQueryError extends Error {
  readonly code: string;
  readonly details: string | null;

  constructor(error: PostgrestError) {
    super(error.message);
    this.name = "SupabaseQueryError";
    this.code = error.code;
    this.details = error.details;
  }
}

type Result<T> = { data: T; error: PostgrestError | null };

/** The query's data, or throws its error. */
export function unwrap<T>({ data, error }: Result<T>): T {
  if (error) throw new SupabaseQueryError(error);
  return data;
}

/** The one row a `.single()` query returns, or throws its error (or that it returned none). */
export function unwrapRow<T>(result: Result<T>): NonNullable<T> {
  const row = unwrap(result);
  if (row === null || row === undefined) throw new Error("Expected one row, got none");
  return row;
}

/** Rows per request when paging. Supabase returns at most `max_rows` (1,000 by default) per request. */
export const PAGE_SIZE = 1000;

/**
 * Every row of a list that could outgrow one response. `page(from, to)` runs the query with
 * `.range(from, to)`; paging stops on an empty page rather than a short one, so a project whose
 * `max_rows` is set below PAGE_SIZE still gets every row.
 */
export async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<Result<T[] | null>>): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const batch = unwrap(await page(rows.length, rows.length + PAGE_SIZE - 1)) ?? [];
    if (batch.length === 0) return rows;
    rows.push(...batch);
  }
}

/** A timestamp from PostgREST (`+00:00`) in the API's ISO form (`Z`). */
export const isoTimestamp = (value: string) => new Date(value).toISOString();
