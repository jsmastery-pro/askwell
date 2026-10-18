// The visitor's current conversation, so a reload continues it. Stored per public key: every
// customer's panel runs on this app's origin and shares its localStorage, and one site's
// conversation must never be sent to another site's project.
const storageKey = (publicKey: string) => `askwell:conversation:${publicKey}`;

// Keys whose last write or removal failed, with the value that should have been stored (null
// after a failed removal). They override storage, which may still hold an older value.
const unsaved = new Map<string, string | null>();

// Storage can throw in third-party iframes (blocked cookies, private mode, full quota),
// so fall back to memory for this page load, like the visitor ID.
export function getConversationId(publicKey: string): string | null {
  if (unsaved.has(publicKey)) return unsaved.get(publicKey) ?? null;
  try {
    return window.localStorage.getItem(storageKey(publicKey));
  } catch {
    return null;
  }
}

export function setConversationId(publicKey: string, conversationId: string): void {
  try {
    window.localStorage.setItem(storageKey(publicKey), conversationId);
    unsaved.delete(publicKey);
  } catch {
    unsaved.set(publicKey, conversationId);
  }
}

export function clearConversationId(publicKey: string): void {
  try {
    window.localStorage.removeItem(storageKey(publicKey));
    unsaved.delete(publicKey);
  } catch {
    unsaved.set(publicKey, null);
  }
}
