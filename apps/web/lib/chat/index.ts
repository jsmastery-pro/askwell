import { ERROR_CODES, PLAN_LIMITS, RETRIEVAL_TOP_K, type Plan, type WidgetChatRequest } from "@askwell/shared";
import { createServiceClient } from "@/lib/supabase/service";
import { embedQuery } from "../ai";
import { captureAiGeneration, captureServerEvent } from "../posthog/server";
import { answerFromChunks, type AnswerTelemetry } from "./answer";

export type ChatTelemetry = AnswerTelemetry & { projectId: string };

export type ChatResult =
  | { ok: true; conversationId: string; reply: string; telemetry: ChatTelemetry }
  | { ok: false; status: 404 | 429; code: string; message: string };

type ServiceClient = ReturnType<typeof createServiceClient>;

const notFound = (message: string): ChatResult => ({ ok: false, status: 404, code: ERROR_CODES.notFound, message });

const quotaExceeded: ChatResult = {
  ok: false,
  status: 429,
  code: ERROR_CODES.quotaExceeded,
  message: "This chat has reached its monthly message limit.",
};

/** Whether the project has anything to answer from: a `ready` source (which always has chunks). */
async function hasReadyChunks(service: ServiceClient, projectId: string): Promise<boolean> {
  const { data } = await service.from("knowledge_sources").select("id").eq("project_id", projectId).eq("status", "ready").limit(1);
  return (data?.length ?? 0) > 0;
}

type MatchedChunk = { content: string; distance: number };

/**
 * One visitor message → one bot reply (project.md §6.6, after the route's rate limit).
 * Resolves the project by public key only, and only ever reads that project's chunks and
 * conversations. Nothing is saved or counted unless a reply is produced.
 *
 * The quota, conversation thread and chunk search are all Postgres functions now (SB-T11): the
 * quota is consumed atomically before the embedding and model call (consume_message), so a
 * project at its limit never costs an OpenAI call and there's no separate "early check" to race
 * with the save any more — the race this used to need a transaction for no longer exists.
 */
export async function handleChat(
  { key, visitorId, conversationId, message }: WidgetChatRequest,
  service: ServiceClient = createServiceClient(),
): Promise<ChatResult> {
  const receivedAt = new Date();

  const { data: project } = await service.from("projects").select("id, owner_id").eq("public_key", key).maybeSingle();
  if (!project) return notFound("Widget not found.");
  const { id: projectId, owner_id: ownerId } = project as { id: string; owner_id: string };

  // Another project's conversation looks exactly like a missing one.
  if (conversationId) {
    const { data: owned } = await service
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("project_id", projectId)
      .maybeSingle();
    if (!owned) return notFound("Conversation not found.");
  }

  // The plan comes from the owner's account, read here on the server (§5, §9 Plan bypass).
  const { data: account } = await service.from("accounts").select("plan").eq("clerk_user_id", ownerId).maybeSingle();
  const plan = (account as { plan: Plan } | null)?.plan ?? "free";
  const limit = PLAN_LIMITS[plan].messagesPerMonth;

  // Counts the message right away: false means the limit was already reached, with no OpenAI call.
  const { data: counted, error: consumeError } = await service.rpc("consume_message", {
    p_project_id: projectId,
    p_message_limit: limit,
  });
  if (consumeError) throw consumeError;
  if (!counted) return quotaExceeded;

  // Nothing ready to answer from: skip the embedding and the model, and say "I don't know" (§9 Cost abuse).
  let chunks: MatchedChunk[] = [];
  if (await hasReadyChunks(service, projectId)) {
    const { data: matches, error: matchError } = await service.rpc("match_chunks", {
      p_project_id: projectId,
      p_query_embedding: await embedQuery(message),
      p_match_count: RETRIEVAL_TOP_K,
    });
    if (matchError) throw matchError;
    chunks = (matches ?? []) as MatchedChunk[];
  }
  const { reply, telemetry } = await answerFromChunks(
    message,
    chunks.map((chunk) => chunk.content),
  );
  // Threads sort by created_at alone, so the reply must sort strictly after the question.
  const repliedAt = new Date(Math.max(Date.now(), receivedAt.getTime() + 1));

  const { data: savedRows, error: saveError } = await service.rpc("save_chat_turn", {
    p_project_id: projectId,
    p_conversation_id: conversationId ?? null,
    p_visitor_id: visitorId,
    p_question: message,
    p_reply: reply,
    p_asked_at: receivedAt.toISOString(),
    p_replied_at: repliedAt.toISOString(),
  });
  if (saveError) {
    if (saveError.code === "AWNOC") return notFound("Conversation not found.");
    if (saveError.code === "AWNOP") return notFound("Widget not found.");
    throw saveError;
  }
  const saved = (savedRows as { conversation_id: string; first_chat: boolean }[])[0]!;

  // After the save, as the project owner (never the visitor). The helpers never throw and don't
  // wait on the network, so PostHog can't change the reply, its status or its timing.
  if (saved.first_chat) captureServerEvent(ownerId, "first_chat", { project_id: projectId });
  if (telemetry.model) {
    captureAiGeneration(ownerId, {
      model: telemetry.model,
      inputTokens: telemetry.inputTokens,
      outputTokens: telemetry.outputTokens,
      latencyMs: telemetry.latencyMs,
      conversationId: saved.conversation_id,
      projectId,
    });
  }

  return { ok: true, conversationId: saved.conversation_id, reply, telemetry: { ...telemetry, projectId } };
}
