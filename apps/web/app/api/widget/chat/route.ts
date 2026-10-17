import {
  ERROR_CODES,
  MAX_CHAT_MESSAGE_LENGTH,
  widgetChatRequestSchema,
  type ApiError,
  type WidgetChatResponse,
} from "@askwell/shared";
import { handleChat } from "../../../../lib/chat";
import { checkRateLimit } from "../../../../lib/rate-limit";

export const dynamic = "force-dynamic";

// Public widget route: any origin, no credentials (§9 CORS).
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(body: WidgetChatResponse | ApiError, status: number, headers: Record<string, string> = {}) {
  return Response.json(body, {
    status,
    headers: { ...CORS_HEADERS, "Cache-Control": "no-store", ...headers },
  });
}

function error(code: string, message: string, status: number, headers?: Record<string, string>) {
  return json({ error: { code, message } }, status, headers);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error(ERROR_CODES.invalidInput, "Send a JSON body.", 400);
  }
  const parsed = widgetChatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return error(
      ERROR_CODES.invalidInput,
      `A valid key, visitorId and message (up to ${MAX_CHAT_MESSAGE_LENGTH.toLocaleString("en-US")} characters) are required.`,
      400,
    );
  }

  // Before the lookup, so unknown keys can't be probed without limit.
  const limit = await checkRateLimit(request, "widgetChat", parsed.data.key);
  if (!limit.allowed) {
    return error(ERROR_CODES.rateLimited, "Too many messages. Try again shortly.", 429, {
      "Retry-After": String(limit.retryAfterSeconds),
    });
  }

  try {
    const result = await handleChat(parsed.data);
    if (!result.ok) return error(result.code, result.message, result.status);
    return json({ conversationId: result.conversationId, reply: result.reply }, 200);
  } catch (cause) {
    // Never echo internals (prompt, chunks, other projects) back to the widget.
    console.error("Widget chat failed", cause);
    return error(ERROR_CODES.internal, "Something went wrong. Try again.", 500);
  }
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: { ...CORS_HEADERS, "Access-Control-Max-Age": "86400" },
  });
}
