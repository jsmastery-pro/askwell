import { defineConfig } from "drizzle-kit";
import { effectiveHost, tlsFor } from "./client";

// Migrations use DIRECT_URL, Supabase's direct (or session-pooler) connection: drizzle-kit needs a
// real session, which the transaction pooler behind DATABASE_URL can't give it. `db:migrate`
// refuses to run without it (package.json); `db:generate` doesn't connect, so the placeholder
// below only keeps the config loadable for it.
const directUrl = process.env["DIRECT_URL"] || "postgresql://localhost:5432/postgres";
const direct = new URL(directUrl);
const host = effectiveHost(directUrl);
const ssl = tlsFor(host);
if (ssl && !process.env["DATABASE_CA_CERT"]?.trim()) {
  console.warn("DATABASE_CA_CERT is not set: the database connection is encrypted, but the server isn't verified");
}

export default defineConfig({
  schema: "./schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
  // Host form rather than `url`, so TLS comes from tlsFor (verified with DATABASE_CA_CERT; none
  // for a local Postgres) instead of whatever sslmode the URL carries.
  dbCredentials: {
    host,
    port: Number(direct.port || 5432),
    user: decodeURIComponent(direct.username),
    password: decodeURIComponent(direct.password),
    database: direct.pathname.replace(/^\//, "") || "postgres",
    ssl,
  },
});
