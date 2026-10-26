import { after } from "next/server";
import { PostHog } from "posthog-node";
import { DEFAULT_POSTHOG_HOST, type PostHogConfigResponse } from "./config";

// A computed key, so Next can't inline it at build time; read fresh from the environment on every call.
function runtimeEnv(name: "NEXT_PUBLIC_POSTHOG_KEY" | "NEXT_PUBLIC_POSTHOG_HOST"): string | undefined {
  return process.env[name] || undefined;
}

export function getPostHogConfig(): PostHogConfigResponse {
  return {
    key: runtimeEnv("NEXT_PUBLIC_POSTHOG_KEY") ?? null,
    host: runtimeEnv("NEXT_PUBLIC_POSTHOG_HOST") ?? DEFAULT_POSTHOG_HOST,
  };
}

/**
 * posthog-node's `waitUntil` hook, routed through Next's `after()` when a request scope is
 * available. `after()` throws synchronously outside one — e.g. instrumentation.ts's
 * onRequestError isn't guaranteed to run inside one, and nesting it inside another after()
 * callback (knowledge ingest) isn't a documented-supported case either. Either way, falling
 * back to doing nothing here is safe: the capture call already happened; this only affects
 * whether the function stays alive long enough for its flush to land.
 */
function waitUntilAfterResponse(promise: Promise<unknown>): void {
  try {
    after(promise);
  } catch {
    // Outside a request scope; nothing here can extend the function's lifetime.
  }
}

/** The server-side product events from project.md §6.11. */
export type ServerEvent = "signed_up" | "project_created" | "knowledge_added" | "upgraded" | "first_chat";

let client: PostHog | null | undefined;

function getClient(): PostHog | null {
  if (client === undefined) {
    const { key, host } = getPostHogConfig();
    // flushAt 1: send each event right away rather than batching in a process that may scale to
    // zero. waitUntil keeps a serverless function alive long enough for that flush's request to
    // land, without making the caller (e.g. the chat reply) wait on it.
    client = key ? new PostHog(key, { host, flushAt: 1, flushInterval: 0, waitUntil: waitUntilAfterResponse }) : null;
  }
  return client;
}

/** Records a product event. A no-op without a key, and never throws into the caller's flow. */
export function captureServerEvent(
  distinctId: string,
  event: ServerEvent,
  properties?: Record<string, string | number | boolean>,
): void {
  try {
    getClient()?.capture({ distinctId, event, properties });
  } catch (error) {
    console.error(`PostHog capture failed for ${event}`, error);
  }
}

/** Records a server exception. A no-op without a key, and never throws. */
export function captureServerException(error: unknown): void {
  try {
    getClient()?.captureException(error);
  } catch (captureError) {
    console.error("PostHog exception capture failed", captureError);
  }
}

/**
 * One model call, for PostHog's LLM analytics (§6.6 step 6). Counts and timings only: there is
 * deliberately no field for the visitor's message, the chunks or the reply (§9, visitor data).
 */
export type AiGeneration = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  /** Groups a conversation's replies into one trace. */
  conversationId: string;
  projectId: string;
};

/** Records an `$ai_generation` event as the project owner. A no-op without a key, and never throws. */
export function captureAiGeneration(distinctId: string, generation: AiGeneration): void {
  try {
    getClient()?.capture({
      distinctId,
      event: "$ai_generation",
      properties: {
        $ai_model: generation.model,
        $ai_provider: "openai",
        $ai_input_tokens: generation.inputTokens,
        $ai_output_tokens: generation.outputTokens,
        $ai_latency: generation.latencyMs / 1000,
        $ai_trace_id: generation.conversationId,
        project_id: generation.projectId,
      },
    });
  } catch (error) {
    console.error("PostHog capture failed for $ai_generation", error);
  }
}
