export type RateLimit = { windowSeconds: number; max: number };

// Per public key + IP, on the public widget routes.
export const RATE_LIMITS = {
  widgetConfig: { windowSeconds: 60, max: 60 },
  // §6.6: 20 messages per minute per public key + IP.
  widgetChat: { windowSeconds: 60, max: 20 },
} as const satisfies Record<string, RateLimit>;
