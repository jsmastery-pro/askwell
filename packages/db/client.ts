import { drizzle } from "drizzle-orm/node-postgres";
import type { ConnectionOptions } from "node:tls";
import { Pool, type PoolConfig } from "pg";
import * as schema from "./schema/index";

type Env = Record<string, string | undefined>;

// libpq SSL parameters. pg lets them override the `ssl` option (dropping the CA, or turning TLS
// off), so TLS is configured only through `tlsOptions`, never on the URL.
const URL_SSL_PARAMS = ["sslmode", "sslrootcert", "sslcert", "sslkey", "sslpassword", "uselibpqcompat"];

/**
 * TLS for every database connection, never plain text. With DATABASE_CA_CERT (the PEM root
 * certificate from Supabase's Database settings) the server is fully verified; without it the
 * connection is still encrypted, but the server isn't verified (Supabase's `require`).
 */
export function tlsOptions(env: Env = process.env): ConnectionOptions {
  // Env editors often store a PEM on one line with literal "\n".
  const ca = env["DATABASE_CA_CERT"]?.trim().replace(/\\n/g, "\n");
  return ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false };
}

/** A connection string without its SSL parameters, so they can't override `tlsOptions`. */
export function withoutSslParams(url: string): string {
  const parsed = new URL(url);
  for (const param of URL_SSL_PARAMS) parsed.searchParams.delete(param);
  return parsed.toString();
}

/**
 * The app's pool, behind Supabase's transaction pooler (DATABASE_URL, port 6543). Sized for
 * serverless, as Supabase advises: each warm instance holds at most one connection (Vercel runs
 * many instances), idle ones close quickly before a frozen instance can leave them stale, and a
 * connect that can't complete fails fast instead of hanging the request.
 * Drizzle never names a query unless `.prepare(name)` is called (it isn't), so node-postgres only
 * sends unnamed statements, which the transaction pooler supports.
 */
export function poolConfig(env: Env = process.env): PoolConfig {
  const url = env["DATABASE_URL"];
  return {
    connectionString: url ? withoutSslParams(url) : undefined,
    ssl: tlsOptions(env),
    max: 1,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  };
}

// Pool connects lazily, so importing this without DATABASE_URL (e.g. at build) is safe.
const pool = new Pool(poolConfig());
if (!process.env["DATABASE_CA_CERT"]?.trim()) {
  pool.once("connect", () => {
    console.warn("DATABASE_CA_CERT is not set: the database connection is encrypted, but the server isn't verified");
  });
}

export const db = drizzle(pool, { schema });
export type Db = typeof db;
