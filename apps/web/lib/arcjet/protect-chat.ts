// Arcjet protection for POST /api/widget/chat (project.md §3 Security, §6.6
// step 1, §9 Cost abuse + Prompt injection): a fixed-window rate limit per
// public key + client IP, and prompt injection detection on the message.
//
// Fails open (§3): an Arcjet error, timeout or missing key lets the message
// through and logs a warning. The monthly quota still runs in Postgres.
//
// Server only: ARCJET_KEY is a secret (§11), read at first use.
import "server-only";
import arcjet, {
  detectPromptInjection,
  fixedWindow,
  type ArcjetDecision,
  type ArcjetNextRequest,
} from "@arcjet/next";
import { CHAT_RATE_LIMIT } from "@askwell/shared";
import { requireEnv } from "../supabase/env";

export type ChatBlockReason = "rate_limit" | "injection";
export type ChatProtection = { allowed: true } | { allowed: false; reason: ChatBlockReason };

/** Builds the client. One per process, so rules share Arcjet's decision cache. */
function createChatArcjet() {
  return arcjet({
    key: requireEnv("ARCJET_KEY", process.env.ARCJET_KEY),
    rules: [
      fixedWindow({
        mode: "LIVE",
        // "publicKey" is a custom characteristic passed to protect(); "ip.src"
        // is the client IP Arcjet detects (Vercel's trusted header in prod).
        characteristics: ["publicKey", "ip.src"],
        window: CHAT_RATE_LIMIT.windowSeconds,
        max: CHAT_RATE_LIMIT.max,
      }),
      detectPromptInjection({ mode: "LIVE" }),
    ],
  });
}

let client: ReturnType<typeof createChatArcjet> | null = null;
function chatArcjet() {
  client ??= createChatArcjet();
  return client;
}

/** Called when a message is blocked. */
export type OnChatBlocked = (reason: ChatBlockReason) => void | Promise<void>;

/**
 * Phase 4 hook: send the `message_blocked` PostHog event (§6.6 step 1) here,
 * or pass `onBlocked` from the route. No-op until then.
 */
const noopOnBlocked: OnChatBlocked = () => {};

/** Why Arcjet denied, or null for a denial we don't expect from these rules. */
function blockReason(decision: ArcjetDecision): ChatBlockReason | null {
  if (decision.reason.isRateLimit()) return "rate_limit";
  if (decision.reason.isPromptInjection()) return "injection";
  return null;
}

/**
 * Runs the chat route's Arcjet rules once for this request. Call it before
 * any quota count or OpenAI call; a blocked message must reach neither.
 */
export async function protectChat(
  req: ArcjetNextRequest,
  {
    publicKey,
    message,
    onBlocked = noopOnBlocked,
  }: { publicKey: string; message: string; onBlocked?: OnChatBlocked },
): Promise<ChatProtection> {
  let decision: ArcjetDecision;
  try {
    decision = await chatArcjet().protect(req, {
      publicKey,
      detectPromptInjectionMessage: message,
    });
  } catch (error) {
    // protect() is documented not to throw; a missing key or a bad config can.
    console.warn("[arcjet] protectChat failed; allowing the message (fail open).", error);
    return { allowed: true };
  }

  if (decision.isErrored()) {
    console.warn(
      "[arcjet] protectChat errored; allowing the message (fail open).",
      decision.reason.message,
    );
    return { allowed: true };
  }

  if (!decision.isDenied()) return { allowed: true };

  const reason = blockReason(decision);
  if (reason === null) {
    console.warn("[arcjet] protectChat denied for an unexpected reason; allowing.", decision.reason.type);
    return { allowed: true };
  }

  try {
    await onBlocked(reason);
  } catch (error) {
    // Analytics must never change the decision.
    console.warn("[arcjet] onBlocked failed.", error);
  }
  return { allowed: false, reason };
}

/** Test only: forget the cached client so the next call rebuilds it. */
export function resetChatArcjetForTests(): void {
  client = null;
}
