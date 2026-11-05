// Every product event and its properties (project.md §6.11), in one typed map.
//
// Properties are IDs, types and reasons only: never message text, file
// contents or emails. Server events use the owner's Clerk user ID as the
// distinct ID, the same ID the browser identifies with (PostHogIdentify).
//
// Safe to import from client and server: no server-only code here. Server
// code sends with captureServerEvent(serverEvent(...)) from ./server.
import type { KnowledgeSourceType, Plan } from "@askwell/shared";
import posthog from "posthog-js";
import type { ChatBlockReason } from "../arcjet/protect-chat";
import type { ServerEvent } from "./server";

export type AnalyticsEvents = {
  /** The owner's account row was created (first visit after sign-up). Server. */
  signed_up: Record<string, never>;
  /** POST /api/projects succeeded. Server. */
  project_created: { project_id: string };
  /** A knowledge source finished processing ("ready"): pasted text or an upload. Server. */
  knowledge_added: { project_id: string; source_type: KnowledgeSourceType };
  /** The owner copied the install snippet. Client. */
  snippet_copied: { project_id: string };
  /** A project's first visitor chat (B3). Server. */
  first_chat: { project_id: string };
  /** The owner's plan went up (Clerk webhook, Phase 5). Server. */
  upgraded: { plan: Plan; previous_plan: Plan };
  /** The chat route blocked a visitor message (B3). Never the message text. Server. */
  message_blocked: { project_id: string; reason: ChatBlockReason };
};

export type AnalyticsEventName = keyof AnalyticsEvents;

/** A typed server event for captureServerEvent() in ./server. */
export function serverEvent<E extends AnalyticsEventName>(
  distinctId: string,
  event: E,
  properties: AnalyticsEvents[E],
): ServerEvent {
  return { distinctId, event, properties };
}

/**
 * Sends a typed event from the browser. Does nothing where PostHog isn't
 * initialized (e.g. /embed, or no key); never throws into the UI.
 */
export function captureClientEvent<E extends AnalyticsEventName>(event: E, properties: AnalyticsEvents[E]): void {
  try {
    if (posthog.__loaded) posthog.capture(event, properties);
  } catch (error) {
    console.error(`PostHog capture ${event} failed`, error);
  }
}
