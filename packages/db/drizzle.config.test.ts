import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { describeTarget, findRepoRoot, migrationTarget, readEnvFiles } from "./drizzle.config";

const DEV = "postgresql://postgres.devref:devPW@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres";
const PROD = "postgresql://postgres.prodref:prodPW@aws-0-eu-central-1.pooler.supabase.com:5432/postgres";

function tempRoot(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "askwell-env-"));
  writeFileSync(join(root, "pnpm-workspace.yaml"), "packages: []\n");
  for (const [name, body] of Object.entries(files)) writeFileSync(join(root, name), body);
  return root;
}
const envFilesIn = (root: string) => readEnvFiles([join(root, ".env.local"), join(root, ".env")]);

describe("findRepoRoot", () => {
  it("finds the workspace root from packages/db, where pnpm --filter runs drizzle-kit", () => {
    const root = tempRoot({});
    mkdirSync(join(root, "packages", "db"), { recursive: true });
    expect(findRepoRoot(join(root, "packages", "db"))).toBe(root);
  });
});

describe("readEnvFiles", () => {
  it("reads .env.local over .env, and skips missing files", () => {
    const root = tempRoot({ ".env.local": `DIRECT_URL="${DEV}"\n`, ".env": `DIRECT_URL=${PROD}\nOTHER=1\n` });
    expect(envFilesIn(root)).toMatchObject({ DIRECT_URL: DEV, OTHER: "1" });
    expect(envFilesIn(tempRoot({}))).toEqual({});
  });

  it("keeps .env's value when .env.local leaves the same variable blank", () => {
    const root = tempRoot({
      ".env.local": "DIRECT_URL=\nDATABASE_CA_CERT=\n",
      ".env": `DIRECT_URL=${PROD}\nDATABASE_CA_CERT=pem-from-env\n`,
    });
    expect(envFilesIn(root)).toMatchObject({ DIRECT_URL: PROD, DATABASE_CA_CERT: "pem-from-env" });
    expect(migrationTarget({}, envFilesIn(root))).toMatchObject({ ok: true, url: PROD, caCert: "pem-from-env" });
  });
});

describe("migrationTarget", () => {
  it("finds DIRECT_URL when it's only in .env.local", () => {
    const target = migrationTarget({}, envFilesIn(tempRoot({ ".env.local": `DIRECT_URL=${DEV}\n` })));
    expect(target).toMatchObject({ ok: true, url: DEV, host: "aws-0-ap-northeast-2.pooler.supabase.com", port: 5432 });
  });

  it("lets an inline DIRECT_URL override .env.local (prod inline, dev in the file)", () => {
    const target = migrationTarget({ DIRECT_URL: PROD }, envFilesIn(tempRoot({ ".env.local": `DIRECT_URL=${DEV}\n` })));
    expect(target).toMatchObject({ ok: true, url: PROD, host: "aws-0-eu-central-1.pooler.supabase.com" });
  });

  it("falls back to the file when the environment's value is empty", () => {
    const target = migrationTarget({ DIRECT_URL: "" }, { DIRECT_URL: DEV });
    expect(target).toMatchObject({ ok: true, url: DEV });
  });

  it("takes DATABASE_CA_CERT the same way: environment first, then the file", () => {
    expect(migrationTarget({ DIRECT_URL: DEV }, { DATABASE_CA_CERT: "from-file" })).toMatchObject({ caCert: "from-file" });
    expect(migrationTarget({ DIRECT_URL: DEV, DATABASE_CA_CERT: "inline" }, { DATABASE_CA_CERT: "from-file" })).toMatchObject({
      caCert: "inline",
    });
  });

  it("gives the clear error when DIRECT_URL is nowhere", () => {
    const target = migrationTarget({}, envFilesIn(tempRoot({ ".env": "OTHER=1\n" })));
    expect(target).toEqual({
      ok: false,
      error: expect.stringContaining("db:migrate needs DIRECT_URL"),
    });
  });
});

describe("describeTarget", () => {
  it("names the host, port and database, never the user or password", () => {
    const target = migrationTarget({ DIRECT_URL: PROD }, {});
    if (!target.ok) throw new Error("expected a target");
    const line = describeTarget(target);
    expect(line).toBe("Migrating aws-0-eu-central-1.pooler.supabase.com:5432/postgres");
    expect(line).not.toContain("prodPW");
    expect(line).not.toContain("postgres.prodref");
  });
});
