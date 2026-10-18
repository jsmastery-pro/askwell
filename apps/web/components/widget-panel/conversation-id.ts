// The visitor's current conversation, so a reload continues it. Stored per public key: every
// customer's panel runs on this app's origin and shares its localStorage, and one site's
// conversation must never be sent to another site's project.
const storageKey = (publicKey: string) => `askwell:conversation:${publicKey}`;

const memory = new Map<string, string>();

// Storage can throw in third-party iframes (blocked cookies, private mode),
// so fall back to memory for this page load, like the visitor ID.
export function getConversationId(publicKey: string): string | null {
  try {
    // Readable storage is the source of truth; memory is only for when it throws.
    return window.localStorage.getItem(storageKey(publicKey));
  } catch {
    return memory.get(publicKey) ?? null;
  }
}

export function setConversationId(publicKey: string, conversationId: string): void {
  memory.set(publicKey, conversationId);
  try {
    window.localStorage.setItem(storageKey(publicKey), conversationId);
  } catch {
    // Memory only.
  }
}

export function clearConversationId(publicKey: string): void {
  memory.delete(publicKey);
  try {
    window.localStorage.removeItem(storageKey(publicKey));
  } catch {
    // Memory only.
  }
}
