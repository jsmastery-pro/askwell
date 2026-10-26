import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { effectiveHost, poolConfig, tlsFor, tlsOptions, withoutSslParams } from "./client";

// pg's own parsing of a client config, to check what a connection would really use.
const ConnectionParameters = createRequire(import.meta.url)("pg/lib/connection-parameters") as new (config: object) => {
  ssl: unknown;
  host: string;
  port: number;
};

const POOLER = "postgresql://postgres.abcdef:p%40ss@aws-0-eu-central-1.pooler.supabase.com:6543/postgres";
const PEM = "-----BEGIN CERTIFICATE-----\nMIIDtest\n-----END CERTIFICATE-----";

describe("tlsOptions", () => {
  it("verifies the server against DATABASE_CA_CERT", () => {
    expect(tlsOptions({ DATABASE_CA_CERT: PEM })).toEqual({ ca: PEM, rejectUnauthorized: true });
  });

  it("accepts a PEM stored on one line with literal \\n", () => {
    expect(tlsOptions({ DATABASE_CA_CERT: PEM.replace(/\n/g, "\\n") }).ca).toBe(PEM);
  });

  it("without a CA, still requires TLS (encrypted, server unverified), never plain text", () => {
    for (const env of [{}, { DATABASE_CA_CERT: "" }, { DATABASE_CA_CERT: "  " }]) {
      expect(tlsOptions(env)).toEqual({ rejectUnauthorized: false });
    }
  });
});

describe("tlsFor", () => {
  it("allows a plain connection only to a Postgres on this machine", () => {
    for (const host of ["localhost", "LOCALHOST", "127.0.0.1", "::1", "[::1]"]) {
      expect(tlsFor(host, { DATABASE_CA_CERT: PEM })).toBe(false);
    }
  });

  it("requires TLS for every other host, including ones that only look local", () => {
    for (const host of ["aws-0-eu-central-1.pooler.supabase.com", "db.abcdef.supabase.co", "localhost.evil.com", "127.0.0.2", "10.0.0.5"]) {
      expect(tlsFor(host, {})).toEqual({ rejectUnauthorized: false });
      expect(tlsFor(host, { DATABASE_CA_CERT: PEM })).toEqual({ ca: PEM, rejectUnauthorized: true });
    }
  });
});

describe("withoutSslParams", () => {
  it("drops libpq SSL parameters and keeps everything else", () => {
    const url = `${POOLER}?ssl=0&sslmode=require&sslrootcert=/x.crt&uselibpqcompat=true&application_name=askwell`;
    expect(withoutSslParams(url)).toBe(`${POOLER}?application_name=askwell`);
  });
});

describe("poolConfig", () => {
  it("is sized for serverless: one connection per instance, short idle and connect timeouts", () => {
    expect(poolConfig({ DATABASE_URL: POOLER })).toMatchObject({
      connectionString: POOLER,
      max: 1,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });
  });

  it("is safe to build without DATABASE_URL (e.g. at build time)", () => {
    expect(poolConfig({}).connectionString).toBeUndefined();
  });

  it("keeps the CA even when the URL says sslmode=require (pg would otherwise drop it)", () => {
    const config = poolConfig({ DATABASE_URL: `${POOLER}?sslmode=require`, DATABASE_CA_CERT: PEM });
    const params = new ConnectionParameters(config);
    expect(params.ssl).toEqual({ ca: PEM, rejectUnauthorized: true });
    expect(params.host).toBe("aws-0-eu-central-1.pooler.supabase.com");
    expect(params.port).toBe(6543);
  });

  it("can't be switched to plain text by ?ssl=0 or ?ssl=false on the URL", () => {
    for (const flag of ["0", "false"]) {
      const params = new ConnectionParameters(poolConfig({ DATABASE_URL: `${POOLER}?ssl=${flag}` }));
      expect(params.ssl).toEqual({ rejectUnauthorized: false });
    }
  });

  it("decides TLS by the host pg really connects to, so ?host= can't make a remote look local", () => {
    const url = "postgresql://postgres:pw@localhost:5432/postgres?host=db.example.com";
    expect(effectiveHost(url)).toBe("db.example.com");
    const params = new ConnectionParameters(poolConfig({ DATABASE_URL: url }));
    expect(params.host).toBe("db.example.com");
    expect(params.ssl).toEqual({ rejectUnauthorized: false });
  });

  it("connects to a local Postgres without SSL, e.g. to test a migration", () => {
    for (const url of ["postgresql://postgres:pw@localhost:5432/askwell", "postgresql://postgres:pw@[::1]:5432/askwell"]) {
      expect(new ConnectionParameters(poolConfig({ DATABASE_URL: url })).ssl).toBe(false);
    }
  });

  it("never connects in plain text, even from a URL with no sslmode or with sslmode=disable", () => {
    for (const url of [POOLER, `${POOLER}?sslmode=disable`]) {
      expect(new ConnectionParameters(poolConfig({ DATABASE_URL: url })).ssl).toEqual({ rejectUnauthorized: false });
    }
  });
});
