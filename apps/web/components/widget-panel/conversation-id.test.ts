import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

// A fresh module import stands in for a page reload: in-memory state is gone,
// only localStorage survives.
async function loadFresh() {
  vi.resetModules();
  return import("./conversation-id");
}

describe("conversation ID storage", () => {
  it("keeps the conversation across reloads", async () => {
    (await loadFresh()).setConversationId("pk_acme", "c-1");
    expect((await loadFresh()).getConversationId("pk_acme")).toBe("c-1");
  });

  it("keeps one conversation per public key", async () => {
    const { getConversationId, setConversationId } = await loadFresh();
    setConversationId("pk_acme", "c-acme");
    setConversationId("pk_other", "c-other");
    expect(getConversationId("pk_acme")).toBe("c-acme");
    expect(getConversationId("pk_other")).toBe("c-other");
    expect(getConversationId("pk_new")).toBeNull();
  });

  it("clears only that key's conversation", async () => {
    const { clearConversationId, getConversationId, setConversationId } = await loadFresh();
    setConversationId("pk_acme", "c-acme");
    setConversationId("pk_other", "c-other");
    clearConversationId("pk_acme");
    expect(getConversationId("pk_acme")).toBeNull();
    expect((await loadFresh()).getConversationId("pk_other")).toBe("c-other");
  });

  it("uses the new ID, not an older stored one, when only the write fails", async () => {
    const { getConversationId, setConversationId } = await loadFresh();
    setConversationId("pk_acme", "c-old");
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });

    setConversationId("pk_acme", "c-new");
    expect(getConversationId("pk_acme")).toBe("c-new");

    // Once a write works again, storage is the source of truth.
    write.mockRestore();
    setConversationId("pk_acme", "c-saved");
    expect(getConversationId("pk_acme")).toBe("c-saved");
    expect((await loadFresh()).getConversationId("pk_acme")).toBe("c-saved");
  });

  it("doesn't bring back a cleared ID when only the removal fails", async () => {
    const { clearConversationId, getConversationId, setConversationId } = await loadFresh();
    setConversationId("pk_acme", "c-stale");
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });

    clearConversationId("pk_acme");
    expect(getConversationId("pk_acme")).toBeNull();
  });

  it("falls back to memory for this page load when storage throws", async () => {
    for (const method of ["getItem", "setItem", "removeItem"] as const) {
      vi.spyOn(Storage.prototype, method).mockImplementation(() => {
        throw new DOMException("blocked", "SecurityError");
      });
    }
    const { clearConversationId, getConversationId, setConversationId } = await loadFresh();

    setConversationId("pk_acme", "c-1");
    expect(getConversationId("pk_acme")).toBe("c-1");
    clearConversationId("pk_acme");
    expect(getConversationId("pk_acme")).toBeNull();
  });
});
