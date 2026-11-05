// Chat analytics for POST /api/widget/chat (project.md §6.6 steps 1 and 7,
// §6.11): the AI trace of each model call, `first_chat` and
// `message_blocked`.
//
// - Distinct ID: the project owner's Clerk ID, so chat events join the
//   owner's funnel. The visitor ID (random) is a property.
// - Never in the way: every send runs after the response (after()), and no
//   failure reaches the route.
// - PO decision (2026-11-05): the trace includes the prompt as sent to OpenAI
//   (system prompt with this project's chunks, plus the visitor message) and
//   the reply. No secrets are in either. `message_blocked` never carries the
//   message text (§6.6 step 1).
import "server-only";
import { after } from "next/server";
import { serverEvent, type MessageBlockedReason } from "../analytics/events";
import { captureServerEvent } from "../analytics/server";
import type { ChatBlockReason } from "../arcjet/protect-chat";
import { createServiceClient } from "../supabase/service";

/** OpenAI's API base, for PostHog's generation view. */
const OPENAI_BASE_URL = "https://api.openai.com/v1";

export type TraceMessage = { role: "system" | "user" | "assistant"; content: string };

export type ChatTrace = {
  ownerId: string;
  projectId: string;
  conversationId: string;
  visitorId: string;
  model: string;
  /** Exactly what was sent to OpenAI: the system prompt, then the visitor message. */
  input: TraceMessage[];
  /** The model's reply. */
  output: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
};

/** Runs `task` after the response; logs and swallows any failure. */
function afterResponse(label: string, task: () => Promise<void>): void {
  const safe = async () => {
    try {
      await task();
    } catch (error) {
      console.error(`Chat analytics (${label}) failed`, error);
    }
  };
  try {
    after(safe);
  } catch {
    // Not inside a request (tests, scripts): run now, without waiting.
    void safe();
  }
}

/**
 * Sends the `$ai_generation` event for one chat model call. PostHog computes
 * the cost from the model and tokens. Grouped per conversation: the trace ID
 * is the conversation ID, so every turn of a chat lands in one trace.
 */
export function traceChat(trace: ChatTrace): void {
  captureServerEvent({
    distinctId: trace.ownerId,
    event: "$ai_generation",
    properties: {
      $ai_trace_id: trace.conversationId,
      $ai_span_name: "chat_reply",
      $ai_provider: "openai",
      $ai_model: trace.model,
      $ai_base_url: OPENAI_BASE_URL,
      $ai_http_status: 200,
      $ai_input: trace.input,
      $ai_output_choices: [{ role: "assistant", content: trace.output }],
      $ai_input_tokens: trace.inputTokens,
      $ai_output_tokens: trace.outputTokens,
      $ai_latency: trace.latencyMs / 1000,
      project_id: trace.projectId,
      conversation_id: trace.conversationId,
      visitor_id: trace.visitorId,
    },
  });
}

/**
 * Sends `first_chat` if `conversationId` (just created) is the project's
 * oldest conversation. Checked after the response, so the reply never waits.
 *
 * Under a race between two first conversations, only one is the oldest, so
 * one event is sent. If the owner later deletes every conversation, the next
 * one is the oldest again and sends another `first_chat`; that's accepted.
 */
export function reportNewConversation(ownerId: string, projectId: string, conversationId: string): void {
  afterResponse("first_chat", async () => {
    const { data, error } = await createServiceClient()
      .from("conversations")
      .select("id")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (data?.id === conversationId) {
      captureServerEvent(serverEvent(ownerId, "first_chat", { project_id: projectId }));
    }
  });
}

const BLOCK_REASONS: Record<ChatBlockReason, MessageBlockedReason> = {
  rate_limit: "rate_limit",
  injection: "prompt_injection",
};

/**
 * Sends `message_blocked` with the reason (never the message). The block runs
 * before the project is looked up, so the owner is found by public key after
 * the response. An unknown key sends nothing: there's no owner to send it to.
 */
export function reportBlocked(publicKey: string, reason: ChatBlockReason): void {
  afterResponse("message_blocked", async () => {
    const { data, error } = await createServiceClient()
      .from("projects")
      .select("id, owner_id")
      .eq("public_key", publicKey)
      .maybeSingle();
    if (error) throw error;
    if (!data) return;
    captureServerEvent(
      serverEvent(data.owner_id, "message_blocked", { project_id: data.id, reason: BLOCK_REASONS[reason] }),
    );
  });
}
