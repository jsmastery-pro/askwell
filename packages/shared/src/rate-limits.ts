export type RateLimit = { windowSeconds: number; max: number };

// Per public key + IP, on the public widget routes. Starting values; chat is added in Phase 3.
export const RATE_LIMITS = {
  widgetConfig: { windowSeconds: 60, max: 60 },
} as const satisfies Record<string, RateLimit>;
