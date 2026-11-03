import { widgetConfigQuery } from "@askwell/shared";
import { describe, expect, it } from "vitest";
import { publicCorsHeaders, publicPreflight, withPublicCors } from "./cors";
import { jsonError } from "./errors";
import { parseInput, parseQuery } from "./validation";

describe("jsonError", () => {
  it("returns the §8 error shape with the given status", async () => {
    const res = jsonError(403, "forbidden", "Not yours.");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: { code: "forbidden", message: "Not yours." } });
  });

  it("keeps extra headers from init, but the status argument wins", () => {
    const res = jsonError(404, "not_found", "Gone.", { status: 200, headers: { "X-Test": "1" } });
    expect(res.status).toBe(404);
    expect(res.headers.get("x-test")).toBe("1");
  });
});

describe("parseInput", () => {
  it("returns the parsed data", () => {
    expect(parseInput(widgetConfigQuery, { key: "pk_abc" })).toEqual({
      success: true,
      data: { key: "pk_abc" },
    });
  });

  it("returns a 400 validation_failed response naming the field", async () => {
    const result = parseInput(widgetConfigQuery, { key: "nope" });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.response.status).toBe(400);
    expect(await result.response.json()).toEqual({
      error: { code: "validation_failed", message: "key: Invalid public key" },
    });
  });
});

describe("parseQuery", () => {
  it("parses search params", () => {
    expect(parseQuery(widgetConfigQuery, new URLSearchParams("key=pk_abc"))).toEqual({
      success: true,
      data: { key: "pk_abc" },
    });
  });

  it.each(["__proto__", "constructor", "toString"])(
    "passes a %s parameter to the schema, so a strict schema rejects it",
    async (name) => {
      const result = parseQuery(widgetConfigQuery, new URLSearchParams(`key=pk_abc&${name}=x`));
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.response.status).toBe(400);
      expect(await result.response.json()).toMatchObject({ error: { code: "validation_failed" } });
    },
  );

  it("rejects a repeated parameter", async () => {
    const result = parseQuery(widgetConfigQuery, new URLSearchParams("key=pk_a&key=pk_b"));
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.response.status).toBe(400);
    expect(await result.response.json()).toMatchObject({
      error: { code: "validation_failed", message: "key: Send this parameter once." },
    });
  });
});

describe("public CORS", () => {
  it("allows any origin, the given methods plus OPTIONS, and no credentials", () => {
    expect(publicCorsHeaders(["GET"])).toEqual({
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    });
    expect(publicCorsHeaders(["POST"])["Access-Control-Allow-Methods"]).toBe("POST, OPTIONS");
  });

  it("adds the headers to an existing response", () => {
    const res = withPublicCors(Response.json({ ok: true }), ["GET"]);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-credentials")).toBeNull();
  });

  it("answers a preflight with 204 and no body", async () => {
    const res = publicPreflight(["GET"]);
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(res.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS");
  });
});
