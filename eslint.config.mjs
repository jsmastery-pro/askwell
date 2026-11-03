// @ts-check
import js from "@eslint/js";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

const WEB = "apps/web/**";

// --- Supabase secret guard (project.md §9 "Secrets", "Tenant leak") ---------
// Only apps/web/lib/supabase/service.ts may name or read the secret key.
// The server-only Supabase clients (service, owner) may never be imported
// from a "use client" file or from apps/widget.
const SECRET_KEY_FILE = "apps/web/lib/supabase/service.ts";
// Built from parts so this file doesn't trip its own rule.
const SECRET_NAME = ["SUPABASE", "SECRET", "KEY"].join("_");
const SECRET_MESSAGE = `${SECRET_NAME} may be read only in ${SECRET_KEY_FILE}. Use createServiceClient().`;
const SERVER_CLIENT_SOURCE = String.raw`/(^|\/)lib\/supabase\/(service|owner)(\.ts)?$/`;
const SERVER_CLIENT_MESSAGE =
  "The Supabase service and owner clients are server-only. Never import them from a client component or the widget.";

/** Any mention of the secret's name: process.env.X, process.env["X"], { X } = process.env, "X". */
const SECRET_RULES = [
  { selector: `Identifier[name='${SECRET_NAME}']`, message: SECRET_MESSAGE },
  { selector: `Literal[value='${SECRET_NAME}']`, message: SECRET_MESSAGE },
  { selector: `TemplateElement[value.raw=/${SECRET_NAME}/]`, message: SECRET_MESSAGE },
];
/** Static imports, re-exports and dynamic import() of the server clients. */
const serverClientImports = (prefix) =>
  ["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration"]
    .map((node) => `${prefix}${node}[source.value=${SERVER_CLIENT_SOURCE}]`)
    .concat(`${prefix ? `${prefix}* ` : ""}ImportExpression[source.value=${SERVER_CLIENT_SOURCE}]`)
    .map((selector) => ({ selector, message: SERVER_CLIENT_MESSAGE }));
/** Only in files whose first statement is "use client". */
const CLIENT_COMPONENT_IMPORT_RULES = serverClientImports(
  "Program > ExpressionStatement[directive='use client'] ~ ",
);
/** Everywhere in the file (apps/widget). */
const ANY_IMPORT_RULES = serverClientImports("");

export default defineConfig(
  globalIgnores([
    "**/node_modules/",
    "**/.next/",
    "**/out/",
    "**/dist/",
    "**/coverage/",
    "**/.vercel/",
    "**/next-env.d.ts",
  ]),

  // Everything outside apps/web: plain JS + typescript-eslint.
  {
    ignores: [WEB],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node },
    },
  },
  {
    files: ["apps/widget/src/**"],
    languageOptions: { globals: { ...globals.browser } },
  },

  // apps/web: Next's own config (core web vitals + TypeScript).
  {
    files: [WEB],
    extends: [nextVitals, nextTs],
    settings: { next: { rootDir: "apps/web" } },
  },

  // Team rules for every TypeScript file.
  {
    files: ["**/*.{ts,tsx,mts}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  // Supabase secret guard. Later blocks replace "no-restricted-syntax" for the
  // files they match, so each block lists every selector it needs.
  {
    files: ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"],
    rules: { "no-restricted-syntax": ["error", ...SECRET_RULES] },
  },
  {
    files: ["apps/web/**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"],
    rules: { "no-restricted-syntax": ["error", ...SECRET_RULES, ...CLIENT_COMPONENT_IMPORT_RULES] },
  },
  {
    files: ["apps/widget/**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"],
    rules: { "no-restricted-syntax": ["error", ...SECRET_RULES, ...ANY_IMPORT_RULES] },
  },
  {
    files: [SECRET_KEY_FILE],
    rules: { "no-restricted-syntax": ["error", ...CLIENT_COMPONENT_IMPORT_RULES] },
  },
);
