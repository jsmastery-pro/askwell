const STORAGE_KEY = "askwell:visitor-id";

let memoryId: string | null = null;

// Storage can throw in third-party iframes (blocked cookies, private mode),
// so fall back to an ID that lasts for this page load.
export function getVisitorId(): string {
  try {
    const storage = window.localStorage;
    const existing = storage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    storage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    memoryId ??= crypto.randomUUID();
    return memoryId;
  }
}
