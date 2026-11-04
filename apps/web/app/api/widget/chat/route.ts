// POST /api/widget/chat (project.md §6.6, §8 public): a visitor message in,
// the bot's reply out. Any origin may call it (§9 "CORS"); the public key
// only identifies a project (§9 "Public key abuse"). The flow lives in
// lib/chat/handle-chat.ts.
import { API_ERROR_STATUS, widgetChatBody, type WidgetChatResponse } from "@askwell/shared";
import type { NextRequest } from "next/server";
import { publicPreflight, withPublicCors, type PublicMethod } from "../../../../lib/api/cors";
import { jsonError } from "../../../../lib/api/errors";
import { parseJsonBody } from "../../../../lib/api/validation";
import { handleChat } from "../../../../lib/chat/handle-chat";

/**
 * Seconds Vercel lets this function run. Above the panel's 60 s client
 * timeout (CHAT_REQUEST_TIMEOUT_MS), so the server never cuts a reply off
 * before the visitor's request gives up. The route makes two OpenAI calls
 * (embedding, then chat), each with a 30 s per-attempt timeout.
 */
export const maxDuration = 90;

const METHODS: readonly PublicMethod[] = ["POST"];

/** Every response: never cached, plus CORS. */
function respond(response: Response): Response {
  response.headers.set("Cache-Control", "no-store");
  return withPublicCors(response, METHODS);
}

export async function POST(request: NextRequest): Promise<Response> {
  const parsed = await parseJsonBody(widgetChatBody, request);
  if (!parsed.success) return respond(parsed.response);

  try {
    const result = await handleChat(request, parsed.data);
    if (!result.ok) {
      return respond(jsonError(API_ERROR_STATUS[result.code], result.code, result.message));
    }
    const body: WidgetChatResponse = result.body;
    return respond(Response.json(body));
  } catch (error) {
    // Model or database failure. If it happened after counting, the message
    // stays counted (§6.6 step 3: no refund).
    console.error("POST /api/widget/chat failed", error);
    return respond(jsonError(API_ERROR_STATUS.internal, "internal", "Something went wrong. Try again."));
  }
}

export function OPTIONS(): Response {
  return publicPreflight(METHODS);
}
