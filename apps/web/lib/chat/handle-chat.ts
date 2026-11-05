// The chat flow behind POST /api/widget/chat (project.md §6.6), in order:
// protect → validate → count → retrieve → answer → save → analytics.
//
// The service client is right here (§9 "Tenant leak", "Public key abuse"):
// a public route with no owner session. The public key only identifies a
// project; every query and function call below is scoped to that project.
import "server-only";
import {
  IDK_REPLY,
  MATCH_COUNT,
  MIN_MATCH_SIMILARITY,
  PLAN_LIMITS,
  PLANS,
  type ApiErrorCode,
  type WidgetChatBody,
  type WidgetChatResponse,
} from "@askwell/shared";
import { chatCompletion, embedTexts } from "../ai/openai";
import { protectChat, type OnChatBlocked } from "../arcjet/protect-chat";
import { createServiceClient } from "../supabase/service";
import { buildSystemPrompt } from "./prompt";
import { reportBlocked, reportNewConversation, traceChat, type TraceMessage } from "./trace";

type ArcjetRequest = Parameters<typeof protectChat>[0];

export type ChatResult =
  | { ok: true; body: WidgetChatResponse }
  | { ok: false; code: ApiErrorCode; message: string };

const fail = (code: ApiErrorCode, message: string): ChatResult => ({ ok: false, code, message });

/** A database or provider step failed; logged with its cause, sent as 500 internal. */
export class ChatStepError extends Error {
  constructor(step: string, options?: ErrorOptions) {
    super(`Chat step failed: ${step}`, options);
    this.name = "ChatStepError";
  }
}

/** The project a public key identifies, with its owner and their plan, or null. */
async function projectForKey(
  key: string,
): Promise<{ id: string; ownerId: string; maxMessages: number } | null> {
  const { data, error } = await createServiceClient()
    .from("projects")
    .select("id, owner_id, accounts(plan)")
    .eq("public_key", key)
    .maybeSingle();
  if (error) throw new ChatStepError("project lookup", { cause: error });
  if (!data) return null;

  // The plan is read here, on the server, for every message (§9 "Plan bypass").
  const plan = PLANS.find((p) => p === data.accounts.plan);
  if (!plan) throw new ChatStepError(`unknown plan "${data.accounts.plan}"`);
  return { id: data.id, ownerId: data.owner_id, maxMessages: PLAN_LIMITS[plan].messagesPerMonth };
}

/** Whether `conversationId` is one of this project's conversations. */
async function conversationBelongs(projectId: string, conversationId: string): Promise<boolean> {
  const { data, error } = await createServiceClient()
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw new ChatStepError("conversation lookup", { cause: error });
  return data !== null;
}

/** Counts the message (§6.6 step 3). False when the monthly quota is used up. */
async function consumeMessage(projectId: string, maxMessages: number): Promise<boolean> {
  const { data, error } = await createServiceClient().rpc("consume_message", {
    p_project_id: projectId,
    p_max_messages: maxMessages,
  });
  if (error) throw new ChatStepError("consume_message", { cause: error });
  const row = data[0];
  if (!row) throw new ChatStepError("consume_message returned no row");
  return row.allowed;
}

/** The chunk texts closest to `message` in this project's ready sources. */
async function retrieve(projectId: string, message: string): Promise<{ content: string }[]> {
  const [embedding] = await embedTexts([message]);
  if (!embedding) throw new ChatStepError("embedding returned no vector");
  const { data, error } = await createServiceClient().rpc("match_chunks", {
    p_project_id: projectId,
    p_embedding: JSON.stringify(embedding),
    p_count: MATCH_COUNT,
    p_min_similarity: MIN_MATCH_SIMILARITY,
  });
  if (error) throw new ChatStepError("match_chunks", { cause: error });
  return data;
}

/** Saves the turn; null when the conversation stopped belonging to the project (deleted meanwhile). */
async function saveTurn(
  projectId: string,
  body: WidgetChatBody,
  reply: string,
): Promise<string | null> {
  const { data, error } = await createServiceClient().rpc("save_chat_turn", {
    p_project_id: projectId,
    p_conversation_id: body.conversationId ?? null,
    p_visitor_id: body.visitorId,
    p_visitor_message: body.message,
    p_bot_reply: reply,
  });
  if (error?.code === "P0002" && error.message === "conversation_not_found") return null;
  if (error) throw new ChatStepError("save_chat_turn", { cause: error });
  return data;
}

const NOT_FOUND_KEY = "No widget uses this key.";
const NOT_FOUND_CONVERSATION = "This conversation doesn't exist.";

/**
 * Runs the whole chat flow for a parsed body. Returns the reply, or the error
 * the route sends. Throws only for unexpected failures (the route sends 500).
 * Nothing is counted before step 3, and nothing reaches OpenAI before it.
 */
export async function handleChat(
  req: ArcjetRequest,
  body: WidgetChatBody,
  { onBlocked }: { onBlocked?: OnChatBlocked } = {},
): Promise<ChatResult> {
  // 1. Protect: rate limit + prompt injection, before anything else runs.
  const protection = await protectChat(req, { publicKey: body.key, message: body.message, onBlocked });
  if (!protection.allowed) {
    reportBlocked(body.key, protection.reason);
    return protection.reason === "rate_limit"
      ? fail("rate_limited", "Too many messages. Wait a minute, then try again.")
      : fail("message_blocked", "This message can't be sent.");
  }

  // 2. Validate: the key's project, and (before counting) the conversation.
  const project = await projectForKey(body.key);
  if (!project) return fail("not_found", NOT_FOUND_KEY);
  if (body.conversationId && !(await conversationBelongs(project.id, body.conversationId))) {
    return fail("not_found", NOT_FOUND_CONVERSATION);
  }

  // 3. Count. From here a failure still uses the message (no refund).
  if (!(await consumeMessage(project.id, project.maxMessages))) {
    return fail("quota_exceeded", "This assistant has reached its message limit for now.");
  }

  // 4. Retrieve, 5. Answer. No matching chunks: IDK_REPLY without a model call.
  const chunks = await retrieve(project.id, body.message);
  let reply = IDK_REPLY;
  let completion: Awaited<ReturnType<typeof chatCompletion>> | null = null;
  let input: TraceMessage[] = [];
  if (chunks.length > 0) {
    const system = buildSystemPrompt(chunks);
    const messages = [{ role: "user" as const, content: body.message }];
    input = [{ role: "system", content: system }, ...messages];
    completion = await chatCompletion({ system, messages });
    reply = completion.text || IDK_REPLY;
  }

  // 6. Save.
  const conversationId = await saveTurn(project.id, body, reply);
  if (conversationId === null) return fail("not_found", NOT_FOUND_CONVERSATION);

  // 7. Analytics, sent after the response (lib/chat/trace.ts).
  if (completion) {
    traceChat({
      ownerId: project.ownerId,
      projectId: project.id,
      conversationId,
      visitorId: body.visitorId,
      model: completion.model,
      input,
      output: completion.text,
      inputTokens: completion.usage.inputTokens,
      outputTokens: completion.usage.outputTokens,
      latencyMs: completion.latencyMs,
    });
  }
  if (!body.conversationId) reportNewConversation(project.ownerId, project.id, conversationId);

  return { ok: true, body: { conversationId, reply } };
}
