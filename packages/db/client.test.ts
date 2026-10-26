import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { poolConfig, tlsOptions, withoutSslParams } from "./client";

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

describe("withoutSslParams", () => {
  it("drops libpq SSL parameters and keeps everything else", () => {
    const url = `${POOLER}?sslmode=require&sslrootcert=/x.crt&uselibpqcompat=true&application_name=askwell`;
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

  it("never connects in plain text, even from a URL with no sslmode or with sslmode=disable", () => {
    for (const url of [POOLER, `${POOLER}?sslmode=disable`]) {
      expect(new ConnectionParameters(poolConfig({ DATABASE_URL: url })).ssl).toEqual({ rejectUnauthorized: false });
    }
  });
});
