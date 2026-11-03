// Proves the Supabase secret guard in eslint.config.mjs: the secret key and
// the server-only clients are rejected where they must never appear, and
// allowed where they belong. Runs the real repo config through ESLint's API.
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const eslint = new ESLint({ cwd: ROOT });

// The first lint loads the whole config (Next's plugins included), which can
// take well over 5s on a busy machine. Do it once here, with room to spare,
// so no single test pays for the cold start.
beforeAll(async () => {
  await eslint.lintText("export {};", { filePath: `${ROOT}apps/web/app/warmup.ts` });
}, 60_000);

// Built, not written out: only service.ts may name the secret's variable.
const SECRET = ["SUPABASE", "SECRET", "KEY"].join("_");

/** The "no-restricted-syntax" messages ESLint reports for `code` at `file`. */
async function guardErrors(file: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: `${ROOT}${file}` });
  return (result?.messages ?? [])
    .filter((message) => message.ruleId === "no-restricted-syntax")
    .map((message) => message.message);
}

const CLIENT = `"use client";\n`;
const SERVER_ONLY = /server-only/;
const SECRET_ONLY_IN_SERVICE = /may be read only in apps\/web\/lib\/supabase\/service\.ts/;

describe("secret key guard", () => {
  it.each([
    ["process.env.X", `export const k = process.env.${SECRET};`],
    ['process.env["X"]', `export const k = process.env["${SECRET}"];`],
    ["destructuring", `const { ${SECRET}: k } = process.env;\nexport { k };`],
    ["a template string", "export const k = process.env[`" + SECRET + "`];"],
  ])("rejects %s in a server file outside service.ts", async (_label, code) => {
    expect(await guardErrors("apps/web/app/api/x/route.ts", code)).toEqual([
      expect.stringMatching(SECRET_ONLY_IN_SERVICE),
    ]);
  });

  it("rejects the secret in a client component", async () => {
    const errors = await guardErrors(
      "apps/web/components/Leak.tsx",
      `${CLIENT}export const k = process.env.${SECRET};`,
    );
    expect(errors).toEqual([expect.stringMatching(SECRET_ONLY_IN_SERVICE)]);
  });

  it("rejects the secret in apps/widget", async () => {
    const errors = await guardErrors("apps/widget/src/leak.ts", `export const k = process.env.${SECRET};`);
    expect(errors).toEqual([expect.stringMatching(SECRET_ONLY_IN_SERVICE)]);
  });

  it("allows the secret in lib/supabase/service.ts", async () => {
    const code = `import "server-only";\nexport const k = process.env.${SECRET};`;
    expect(await guardErrors("apps/web/lib/supabase/service.ts", code)).toEqual([]);
  });
});

describe("server client import guard", () => {
  it.each([
    ["@/ alias", `import { createServiceClient } from "@/lib/supabase/service";`],
    ["relative path", `import { createServiceClient } from "../../lib/supabase/service";`],
    ["the owner client", `import { createOwnerClient } from "@/lib/supabase/owner";`],
    ["a re-export", `export { createServiceClient } from "@/lib/supabase/service";`],
    ["a type-only import", `import type { ServiceClient } from "@/lib/supabase/service";`],
  ])("rejects %s from a \"use client\" file", async (_label, code) => {
    expect(await guardErrors("apps/web/components/Widget.tsx", `${CLIENT}${code}`)).toEqual([
      expect.stringMatching(SERVER_ONLY),
    ]);
  });

  it('rejects a dynamic import() from a "use client" file', async () => {
    const code = `${CLIENT}export async function f() { return import("@/lib/supabase/service"); }`;
    expect(await guardErrors("apps/web/components/Lazy.tsx", code)).toEqual([
      expect.stringMatching(SERVER_ONLY),
    ]);
  });

  it("rejects the service client anywhere in apps/widget", async () => {
    const code = `import { createServiceClient } from "../../web/lib/supabase/service";\nexport { createServiceClient };`;
    expect(await guardErrors("apps/widget/src/leak.ts", code)).toEqual([
      expect.stringMatching(SERVER_ONLY),
    ]);
  });

  it("allows the service and owner clients in server code", async () => {
    const code = [
      `import { createServiceClient } from "@/lib/supabase/service";`,
      `import { createOwnerClient } from "@/lib/supabase/owner";`,
      `export { createServiceClient, createOwnerClient };`,
    ].join("\n");
    expect(await guardErrors("apps/web/app/api/projects/route.ts", code)).toEqual([]);
  });

  it("ignores a \"use client\" string that isn't the file's directive", async () => {
    const code = `import { createServiceClient } from "@/lib/supabase/service";\nexport const s = "use client";\nexport { createServiceClient };`;
    expect(await guardErrors("apps/web/app/api/x/route.ts", code)).toEqual([]);
  });
});
