import { describe, expect, it } from "vitest";
import { distinctIdFromCookies } from "./distinct-id";

const KEY = "phc_test";
const cookie = (value: unknown) => `a=1; ph_${KEY}_posthog=${encodeURIComponent(JSON.stringify(value))}; b=2`;

describe("distinctIdFromCookies", () => {
  it("reads distinct_id from the project's cookie", () => {
    expect(distinctIdFromCookies(cookie({ distinct_id: "user_123" }), KEY)).toBe("user_123");
  });
  it("accepts a cookie header split into parts", () => {
    expect(distinctIdFromCookies(["a=1", cookie({ distinct_id: "user_1" })], KEY)).toBe("user_1");
  });
  it("ignores another project's cookie", () => {
    expect(distinctIdFromCookies(cookie({ distinct_id: "user_123" }), "phc_other")).toBeUndefined();
  });
  it("is undefined for a missing, malformed or empty value", () => {
    expect(distinctIdFromCookies(undefined, KEY)).toBeUndefined();
    expect(distinctIdFromCookies(cookie({ distinct_id: "x" }), undefined)).toBeUndefined();
    expect(distinctIdFromCookies(`ph_${KEY}_posthog=%7Bnope`, KEY)).toBeUndefined();
    expect(distinctIdFromCookies(cookie({ distinct_id: "" }), KEY)).toBeUndefined();
    expect(distinctIdFromCookies(cookie({ other: 1 }), KEY)).toBeUndefined();
  });
});
