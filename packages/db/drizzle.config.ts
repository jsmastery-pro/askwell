import { defineConfig } from "drizzle-kit";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseEnv } from "node:util";
import { effectiveHost, tlsFor } from "./client";

type Env = Record<string, string | undefined>;

const MISSING_DIRECT_URL =
  "db:migrate needs DIRECT_URL: the Supabase direct connection, or postgresql://localhost/... for a local Postgres. " +
  "Set it in the repo root's .env.local, or inline: DIRECT_URL=... pnpm db:migrate";

/** The monorepo root: the nearest directory, from `start` up, with pnpm-workspace.yaml. */
export function findRepoRoot(start: string = process.cwd()): string | null {
  for (let dir = start; ; dir = dirname(dir)) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    if (dirname(dir) === dir) return null;
  }
}

/** Variables from env files, earlier files winning. Missing files are skipped. */
export function readEnvFiles(files: string[]): Env {
  const merged: Env = {};
  for (const file of [...files].reverse()) {
    if (existsSync(file)) Object.assign(merged, parseEnv(readFileSync(file, "utf8")));
  }
  return merged;
}

/** A setting from the environment if it's set there, else from the env files. */
export function setting(name: string, env: Env, fileEnv: Env): string | undefined {
  return env[name]?.trim() ? env[name] : fileEnv[name]?.trim() ? fileEnv[name] : undefined;
}

export type MigrationTarget =
  | { ok: true; url: string; host: string; port: number; database: string; caCert: string | undefined }
  | { ok: false; error: string };

/**
 * Where `db:migrate` will connect: DIRECT_URL from the environment first (so an inline
 * `DIRECT_URL=<prod> pnpm db:migrate` beats .env.local's dev URL), then .env.local, then .env.
 */
export function migrationTarget(env: Env, fileEnv: Env): MigrationTarget {
  const url = setting("DIRECT_URL", env, fileEnv);
  if (!url) return { ok: false, error: MISSING_DIRECT_URL };
  const parsed = new URL(url);
  return {
    ok: true,
    url,
    host: effectiveHost(url),
    port: Number(parsed.port || 5432),
    database: parsed.pathname.replace(/^\//, "") || "postgres",
    caCert: setting("DATABASE_CA_CERT", env, fileEnv),
  };
}

/** What `db:migrate` prints before connecting: host, port and database, never credentials. */
export const describeTarget = (t: { host: string; port: number; database: string }) =>
  `Migrating ${t.host}:${t.port}/${t.database}`;

// Migrations use DIRECT_URL, Supabase's direct (or session-pooler) connection: drizzle-kit needs a
// real session, which the transaction pooler behind DATABASE_URL can't give it. The repo root's
// .env.local and .env are read here (pnpm --filter runs drizzle-kit from packages/db).
const root = findRepoRoot();
const fileEnv = root ? readEnvFiles([join(root, ".env.local"), join(root, ".env")]) : {};
const migrating = process.argv.includes("migrate");
const target = migrationTarget(process.env, fileEnv);

if (migrating && !target.ok) {
  console.error(target.error);
  process.exit(1);
}
// `db:generate` doesn't connect, so without DIRECT_URL a placeholder only keeps the config loadable.
const resolved = target.ok
  ? target
  : { url: "postgresql://localhost:5432/postgres", host: "localhost", port: 5432, database: "postgres", caCert: undefined };
const direct = new URL(resolved.url);
const ssl = tlsFor(resolved.host, { DATABASE_CA_CERT: resolved.caCert });
if (migrating) {
  console.log(describeTarget(resolved));
  if (ssl && !resolved.caCert?.trim()) {
    console.warn("DATABASE_CA_CERT is not set: the database connection is encrypted, but the server isn't verified");
  }
}

export default defineConfig({
  schema: "./schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
  // Host form rather than `url`, so TLS comes from tlsFor (verified with DATABASE_CA_CERT; none
  // for a local Postgres) instead of whatever sslmode the URL carries.
  dbCredentials: {
    host: resolved.host,
    port: resolved.port,
    user: decodeURIComponent(direct.username),
    password: decodeURIComponent(direct.password),
    database: resolved.database,
    ssl,
  },
});
