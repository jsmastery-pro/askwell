import { drizzle } from "drizzle-orm/node-postgres";
import type { ConnectionOptions } from "node:tls";
import { Pool, type PoolConfig } from "pg";
import * as schema from "./schema/index";

type Env = Record<string, string | undefined>;

// libpq SSL parameters. pg lets them override the `ssl` option (dropping the CA, or turning TLS
// off), so TLS is configured only through `tlsOptions`, never on the URL.
const URL_SSL_PARAMS = ["sslmode", "sslrootcert", "sslcert", "sslkey", "sslpassword", "uselibpqcompat"];

/**
 * TLS for a remote database connection, never plain text. With DATABASE_CA_CERT (the PEM root
 * certificate from Supabase's Database settings) the server is fully verified; without it the
 * connection is still encrypted, but the server isn't verified (Supabase's `require`).
 */
export function tlsOptions(env: Env = process.env): ConnectionOptions {
  // Env editors often store a PEM on one line with literal "\n".
  const ca = env["DATABASE_CA_CERT"]?.trim().replace(/\\n/g, "\n");
  return ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false };
}

// A Postgres on this machine (e.g. testing a migration locally) usually runs without SSL.
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export const isLocalHost = (host: string) => LOCAL_HOSTS.has(host.toLowerCase());

/**
 * TLS for a connection to `host`: none for a local Postgres, `tlsOptions` for anything else, so a
 * remote database is never reached in plain text.
 */
export function tlsFor(host: string, env: Env = process.env): ConnectionOptions | false {
  return isLocalHost(host) ? false : tlsOptions(env);
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
    // No URL yet (e.g. at build) counts as remote: TLS, never plain text.
    ssl: url ? tlsFor(new URL(url).hostname, env) : tlsOptions(env),
    max: 1,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  };
}

// Pool connects lazily, so importing this without DATABASE_URL (e.g. at build) is safe.
const config = poolConfig();
const pool = new Pool(config);
if (config.ssl && !process.env["DATABASE_CA_CERT"]?.trim()) {
  pool.once("connect", () => {
    console.warn("DATABASE_CA_CERT is not set: the database connection is encrypted, but the server isn't verified");
  });
}

export const db = drizzle(pool, { schema });
export type Db = typeof db;
