import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

// A fresh module import stands in for a page reload: in-memory state is gone,
// only localStorage survives.
async function loadFresh() {
  vi.resetModules();
  return (await import("./visitor-id")).getVisitorId;
}

describe("getVisitorId", () => {
  it("keeps the same ID across reloads", async () => {
    const first = (await loadFresh())();
    const afterReload = (await loadFresh())();

    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(afterReload).toBe(first);
  });

  it("falls back to a stable in-memory ID when storage throws", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    const getVisitorId = await loadFresh();

    const id = getVisitorId();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(getVisitorId()).toBe(id);
  });
});
