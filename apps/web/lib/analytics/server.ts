// Server-side PostHog (posthog-node). Every call is safe: analytics never
// throws into the caller and never changes its response.
//
// Vercel functions can freeze right after the response, so nothing is queued:
// events are sent with captureImmediate, scheduled with after() so they don't
// delay the response. Outside a request (no after()), they're sent at once.
import "server-only";
import { after } from "next/server";
import { PostHog } from "posthog-node";
import { posthogServerEnv } from "./env";

let client: PostHog | null = null;

/** The shared client, or null when PostHog isn't configured (events are dropped). */
function getClient(): PostHog | null {
  if (client) return client;
  const env = posthogServerEnv();
  if (!env) return null;
  client = new PostHog(env.key, { host: env.host, flushAt: 1, flushInterval: 0 });
  return client;
}

/** Event properties: IDs, counts, reasons. No secrets; `message_blocked` never carries message text (§6.11). */
export type ServerEventProperties = Record<string, string | number | boolean | null>;

export type ServerEvent = {
  /** The owner's Clerk user ID (the same distinct ID the browser identifies with). */
  distinctId: string;
  event: string;
  properties?: ServerEventProperties;
};

async function safely(label: string, send: (posthog: PostHog) => Promise<void>): Promise<void> {
  try {
    const posthog = getClient();
    if (posthog) await send(posthog);
  } catch (error) {
    console.error(`PostHog ${label} failed`, error);
  }
}

/** Sends one event after the response. Returns at once; never throws. */
export function captureServerEvent({ distinctId, event, properties }: ServerEvent): void {
  const task = () => safely(`capture ${event}`, (posthog) => posthog.captureImmediate({ distinctId, event, properties }));
  try {
    after(task);
  } catch {
    // Not inside a request: send now, without blocking the caller.
    void task();
  }
}

/** Sends an exception to Error tracking. Resolves when sent; never rejects. */
export function captureServerException(
  error: unknown,
  distinctId?: string,
  properties?: ServerEventProperties,
): Promise<void> {
  return safely("exception", (posthog) => posthog.captureExceptionImmediate(error, distinctId, properties));
}
