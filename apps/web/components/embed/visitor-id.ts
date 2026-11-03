// The visitor's random ID (project.md §6.5 "Visitor ID"): kept in the iframe's
// localStorage and reused across visits. If storage is blocked (private mode,
// third-party storage off), an in-memory ID lasts for this page load.
import { APP_NAME, visitorIdSchema } from "@askwell/shared";

export const VISITOR_ID_STORAGE_KEY = `${APP_NAME.toLowerCase()}:visitor-id`;

/** The parts of `Storage` used here. */
export type VisitorIdStorage = Pick<Storage, "getItem" | "setItem">;

/** 32 hex characters: a UUID v4 without dashes. Valid for visitorIdSchema. */
export function newVisitorId(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

let memoryId: string | null = null;

/** Forgets the in-memory fallback (tests only). */
export function resetMemoryVisitorId(): void {
  memoryId = null;
}

function memoryVisitorId(): string {
  memoryId ??= newVisitorId();
  return memoryId;
}

/** The browser's localStorage, or null if reading it throws. */
function defaultStorage(): VisitorIdStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * The stored visitor ID, or a new one (stored for next time). Falls back to
 * an in-memory ID when storage is missing or throws. An invalid stored value
 * is replaced.
 */
export function getVisitorId(storage: VisitorIdStorage | null = defaultStorage()): string {
  if (!storage) return memoryVisitorId();
  try {
    const stored = storage.getItem(VISITOR_ID_STORAGE_KEY);
    if (stored !== null && visitorIdSchema.safeParse(stored).success) return stored;
    const id = newVisitorId();
    storage.setItem(VISITOR_ID_STORAGE_KEY, id);
    return id;
  } catch {
    return memoryVisitorId();
  }
}
