import { execFileSync } from "node:child_process";
import pg from "pg";

/** The database `supabase start` exposes, unless SUPABASE_LOCAL_DB_URL points elsewhere. */
export const LOCAL_SUPABASE_DB_URL =
  process.env.SUPABASE_LOCAL_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function dockerAvailable(): boolean {
  try {
    execFileSync("docker", ["info"], { stdio: "ignore", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * A client on the local Supabase database, or null with the reason to print when tests skip.
 * Never connects anywhere but the local stack: only localhost URLs are accepted.
 */
export async function connectLocalSupabase(): Promise<{ client: pg.Client } | { client: null; reason: string }> {
  const host = new URL(LOCAL_SUPABASE_DB_URL).hostname;
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) {
    return { client: null, reason: `SUPABASE_LOCAL_DB_URL must point at localhost, not ${host}` };
  }
  const client = new pg.Client({ connectionString: LOCAL_SUPABASE_DB_URL, connectionTimeoutMillis: 3000 });
  try {
    await client.connect();
    return { client };
  } catch {
    await client.end().catch(() => {});
    return {
      client: null,
      reason: dockerAvailable()
        ? "local Supabase isn't running. Start it with `pnpm supabase start`, then `pnpm supabase db reset`."
        : "Docker isn't available, so local Supabase can't run. Install and start Docker, then `pnpm supabase start`.",
    };
  }
}

/**
 * Switches the current transaction to an API role, as Supabase does for a Data API request:
 * `authenticated` with a Clerk session token's claims, or `anon` with none.
 */
export async function actAs(client: pg.Client, clerkUserId: string | null): Promise<void> {
  const role = clerkUserId ? "authenticated" : "anon";
  const claims = clerkUserId ? { sub: clerkUserId, role } : { role };
  await client.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
  await client.query(`SET LOCAL ROLE ${role}`);
}
