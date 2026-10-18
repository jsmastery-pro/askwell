import { accounts, conversations, messages, projects } from "@askwell/db";
import { db as defaultDb } from "@askwell/db/client";
import { searchChunks, type Database } from "@askwell/db/queries";
import { ERROR_CODES, PLAN_LIMITS, RETRIEVAL_TOP_K, type WidgetChatRequest } from "@askwell/shared";
import { and, eq, lt, sql } from "drizzle-orm";
import { embedQuery } from "../ai";
import { addOneMonth } from "../data/usage";
import { captureAiGeneration, captureServerEvent } from "../posthog/server";
import { answerFromChunks, type AnswerTelemetry } from "./answer";

export type ChatTelemetry = AnswerTelemetry & { projectId: string };

export type ChatResult =
  | { ok: true; conversationId: string; reply: string; telemetry: ChatTelemetry }
  | { ok: false; status: 404 | 429; code: string; message: string };

const notFound = (message: string): ChatResult => ({ ok: false, status: 404, code: ERROR_CODES.notFound, message });

const quotaExceeded: ChatResult = {
  ok: false,
  status: 429,
  code: ERROR_CODES.quotaExceeded,
  message: "This chat has reached its monthly message limit.",
};

/**
 * Messages used in the project's current period. Starts a new period (count 0, period_start now)
 * once the old one is a month old (§6.12). The reset only applies if no other request has
 * reset it first, so concurrent requests can't wipe each other's counts.
 */
async function usedThisPeriod(
  project: { id: string; messagesUsed: number; periodStart: Date },
  database: Database,
  now = new Date(),
): Promise<number> {
  if (addOneMonth(project.periodStart) > now) return project.messagesUsed;
  const [reset] = await database
    .update(projects)
    .set({ messagesUsed: 0, periodStart: now })
    // Postgres keeps microseconds but the Date we read back has only milliseconds, so compare at
    // millisecond precision. A plain equality would never match a database-written period_start.
    .where(
      and(
        eq(projects.id, project.id),
        sql`date_trunc('milliseconds', ${projects.periodStart}) = ${project.periodStart.toISOString()}::timestamptz`,
      ),
    )
    .returning({ messagesUsed: projects.messagesUsed });
  if (reset) return reset.messagesUsed;
  const [current] = await database
    .select({ messagesUsed: projects.messagesUsed })
    .from(projects)
    .where(eq(projects.id, project.id));
  return current?.messagesUsed ?? 0;
}

/**
 * One visitor message → one bot reply (project.md §6.6, after the route's rate limit).
 * Resolves the project by public key only, and only ever reads that project's chunks and
 * conversations. Nothing is saved or counted unless a reply is produced.
 */
export async function handleChat(
  { key, visitorId, conversationId, message }: WidgetChatRequest,
  database: Database = defaultDb,
): Promise<ChatResult> {
  const receivedAt = new Date();
  const [project] = await database
    .select({
      id: projects.id,
      ownerId: projects.ownerId,
      messagesUsed: projects.messagesUsed,
      periodStart: projects.periodStart,
      plan: accounts.plan,
    })
    .from(projects)
    .innerJoin(accounts, eq(accounts.clerkUserId, projects.ownerId))
    .where(eq(projects.publicKey, key))
    .limit(1);
  if (!project) return notFound("Widget not found.");

  // Another project's conversation looks exactly like a missing one.
  if (conversationId) {
    const [owned] = await database
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.projectId, project.id)))
      .limit(1);
    if (!owned) return notFound("Conversation not found.");
  }

  // The plan comes from the owner's account, read here on the server (§5, §9 Plan bypass).
  const limit = PLAN_LIMITS[project.plan].messagesPerMonth;
  // Early check, so a project at its limit costs no OpenAI call. The save below re-checks.
  if ((await usedThisPeriod(project, database, receivedAt)) >= limit) return quotaExceeded;

  const chunks = await searchChunks(project.id, await embedQuery(message), RETRIEVAL_TOP_K, database);
  const { reply, telemetry } = await answerFromChunks(
    message,
    chunks.map((chunk) => chunk.content),
  );
  // Threads sort by created_at alone, so the reply must sort strictly after the question.
  const repliedAt = new Date(Math.max(Date.now(), receivedAt.getTime() + 1));

  const saved = await database.transaction(async (tx) => {
    // Count first, and only while under the limit: requests racing at the boundary can each
    // pass the early check, but only `limit` of them get counted and saved. The rest save nothing.
    // This update also locks the project row until commit, so concurrent saves for one project
    // run one at a time from here on.
    const [counted] = await tx
      .update(projects)
      .set({ messagesUsed: sql`${projects.messagesUsed} + 1` })
      .where(and(eq(projects.id, project.id), lt(projects.messagesUsed, limit)))
      .returning({ id: projects.id });
    if (!counted) return null;

    let id = conversationId;
    let firstChat = false;
    if (!id) {
      // Under the row lock, any earlier save has committed, so this sees every conversation:
      // exactly one request can find none and create the project's first.
      const [earlier] = await tx
        .select({ id: conversations.id })
        .from(conversations)
        .where(eq(conversations.projectId, project.id))
        .limit(1);
      firstChat = !earlier;
      const [created] = await tx
        .insert(conversations)
        .values({ projectId: project.id, visitorId })
        .returning({ id: conversations.id });
      id = created!.id;
    }
    await tx.insert(messages).values([
      { conversationId: id, role: "visitor", body: message, createdAt: receivedAt },
      { conversationId: id, role: "bot", body: reply, createdAt: repliedAt },
    ]);
    return { id, firstChat };
  });
  if (!saved) return quotaExceeded;

  // After the save, as the project owner (never the visitor). The helpers never throw and don't
  // wait on the network, so PostHog can't change the reply, its status or its timing.
  if (saved.firstChat) captureServerEvent(project.ownerId, "first_chat", { project_id: project.id });
  if (telemetry.model) {
    captureAiGeneration(project.ownerId, {
      model: telemetry.model,
      inputTokens: telemetry.inputTokens,
      outputTokens: telemetry.outputTokens,
      latencyMs: telemetry.latencyMs,
      conversationId: saved.id,
      projectId: project.id,
    });
  }

  return { ok: true, conversationId: saved.id, reply, telemetry: { ...telemetry, projectId: project.id } };
}
