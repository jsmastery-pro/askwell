import { defineConfig } from "drizzle-kit";
import { tlsOptions } from "./client";

// Migrations use DIRECT_URL, Supabase's direct (or session-pooler) connection: drizzle-kit needs a
// real session, which the transaction pooler behind DATABASE_URL can't give it. `db:generate`
// doesn't connect, so it works without DIRECT_URL.
const direct = new URL(process.env["DIRECT_URL"] || "postgresql://localhost:5432/postgres");
if (!process.env["DATABASE_CA_CERT"]?.trim()) {
  console.warn("DATABASE_CA_CERT is not set: the database connection is encrypted, but the server isn't verified");
}

export default defineConfig({
  schema: "./schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
  // Host form rather than `url`, so TLS comes from tlsOptions (verified with DATABASE_CA_CERT)
  // instead of whatever sslmode the URL carries.
  dbCredentials: {
    host: direct.hostname,
    port: Number(direct.port || 5432),
    user: decodeURIComponent(direct.username),
    password: decodeURIComponent(direct.password),
    database: direct.pathname.replace(/^\//, "") || "postgres",
    ssl: tlsOptions(),
  },
});
