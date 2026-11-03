import { visitorIdSchema } from "@askwell/shared";
import { beforeEach, describe, expect, it } from "vitest";
import {
  getVisitorId,
  newVisitorId,
  resetMemoryVisitorId,
  VISITOR_ID_STORAGE_KEY,
  type VisitorIdStorage,
} from "./visitor-id";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const storage: VisitorIdStorage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  };
  return { storage, data };
}

const throwing: VisitorIdStorage = {
  getItem: () => {
    throw new DOMException("blocked", "SecurityError");
  },
  setItem: () => {
    throw new DOMException("blocked", "SecurityError");
  },
};

beforeEach(() => resetMemoryVisitorId());

describe("visitor ID", () => {
  it("is valid for visitorIdSchema", () => {
    const id = newVisitorId();
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(visitorIdSchema.safeParse(id).success).toBe(true);
  });

  it("is stored and reused across visits", () => {
    const { storage, data } = memoryStorage();
    const first = getVisitorId(storage);
    expect(data.get(VISITOR_ID_STORAGE_KEY)).toBe(first);
    expect(getVisitorId(storage)).toBe(first);
  });

  it("keeps an existing valid ID", () => {
    const { storage } = memoryStorage({ [VISITOR_ID_STORAGE_KEY]: "abc_123-XYZ" });
    expect(getVisitorId(storage)).toBe("abc_123-XYZ");
  });

  it("replaces an invalid stored value", () => {
    const { storage, data } = memoryStorage({ [VISITOR_ID_STORAGE_KEY]: "<script>" });
    const id = getVisitorId(storage);
    expect(id).not.toBe("<script>");
    expect(visitorIdSchema.safeParse(id).success).toBe(true);
    expect(data.get(VISITOR_ID_STORAGE_KEY)).toBe(id);
  });

  it("falls back to one in-memory ID when storage throws", () => {
    const a = getVisitorId(throwing);
    const b = getVisitorId(throwing);
    expect(visitorIdSchema.safeParse(a).success).toBe(true);
    expect(b).toBe(a);
  });

  it("falls back to memory when only setItem throws", () => {
    const storage: VisitorIdStorage = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
    };
    const a = getVisitorId(storage);
    expect(getVisitorId(storage)).toBe(a);
  });

  it("falls back to memory without storage (server, blocked access)", () => {
    const a = getVisitorId(null);
    expect(getVisitorId(null)).toBe(a);
  });
});
