import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { publicCorsHeaders, publicPreflight, withPublicCors } from "./cors";

// project.md §9 "CORS": public widget routes allow any origin; owner routes do
// not. Every route file under app/api must be in exactly one group below, so a
// new route can't quietly add (or forget) CORS.

/** Called from customers' sites by the widget: CORS for any origin, with a preflight. */
const PUBLIC_ROUTES = ["widget/chat", "widget/config"];
/** Same-origin only (owner routes, the Clerk webhook, the app's own config): no CORS headers. */
const NO_CORS_PREFIXES = ["projects", "knowledge/", "conversations/", "clerk/webhook", "posthog-config"];

const API_DIR = fileURLToPath(new URL("../../app/api", import.meta.url));

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return routeFiles(path);
    return name === "route.ts" ? [path] : [];
  });
}

/** "projects/[id]/config" for app/api/projects/[id]/config/route.ts. */
const routeId = (file: string) => relative(API_DIR, file).split(sep).slice(0, -1).join("/");

const routes = routeFiles(API_DIR).map((file) => ({ id: routeId(file), source: readFileSync(file, "utf8") }));

/** Anything in a route file that would send CORS headers. */
const CORS_MARKERS = /Access-Control-|withPublicCors|publicPreflight|publicCorsHeaders|lib\/api\/cors/;

describe("CORS by route group", () => {
  it("finds the API routes", () => {
    expect(routes.length).toBeGreaterThanOrEqual(13);
  });

  it.each(routes.map((r) => [r.id]))("app/api/%s is in exactly one group", (id) => {
    const isPublic = PUBLIC_ROUTES.includes(id);
    const isNoCors = NO_CORS_PREFIXES.some((p) => id === p || id.startsWith(p.endsWith("/") ? p : `${p}/`));
    expect(
      Number(isPublic) + Number(isNoCors),
      `app/api/${id}: add it to PUBLIC_ROUTES or NO_CORS_PREFIXES in lib/api/cors.test.ts`,
    ).toBe(1);
  });

  it.each(PUBLIC_ROUTES)("public app/api/%s adds the public CORS headers and answers OPTIONS", (id) => {
    const route = routes.find((r) => r.id === id);
    expect(route, `app/api/${id}/route.ts is missing`).toBeDefined();
    expect(route?.source).toMatch(/withPublicCors\(/);
    expect(route?.source).toMatch(/export (async )?function OPTIONS\(/);
    expect(route?.source).toMatch(/publicPreflight\(/);
  });

  it.each(routes.filter((r) => !PUBLIC_ROUTES.includes(r.id)).map((r) => [r.id, r.source]))(
    "app/api/%s sends no CORS headers and has no OPTIONS handler",
    (_id, source) => {
      expect(source).not.toMatch(CORS_MARKERS);
      expect(source).not.toMatch(/export (async )?function OPTIONS\b|export const OPTIONS\b/);
    },
  );
});

describe("public CORS helpers", () => {
  it("allow any origin, without credentials", () => {
    expect(publicCorsHeaders(["GET"])).toEqual({
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    });
    expect(Object.keys(publicCorsHeaders(["POST"]))).not.toContain("Access-Control-Allow-Credentials");
  });

  it("the preflight is a 204 with the headers", () => {
    const res = publicPreflight(["POST"]);
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toBe("POST, OPTIONS");
  });

  it("withPublicCors keeps the response and adds the headers", async () => {
    const res = withPublicCors(Response.json({ ok: true }, { status: 429 }), ["GET"]);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});
