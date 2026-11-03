// Row-shaped types, written by hand from project.md §7 (not imported from packages/db).
// Field names are the column names. Timestamps are ISO strings, as supabase-js returns them.
import type {
  KnowledgeSourceStatus,
  KnowledgeSourceType,
  MessageRole,
  Plan,
} from "./enums";
import type { WidgetSettings } from "./widget";

export type Account = {
  clerk_user_id: string;
  plan: Plan;
  created_at: string;
};

export type Project = {
  id: string;
  owner_id: string;
  name: string;
  public_key: string;
  messages_used: number;
  period_start: string;
  created_at: string;
};

export type WidgetConfig = WidgetSettings & {
  project_id: string;
};

export type KnowledgeSource = {
  id: string;
  project_id: string;
  title: string;
  type: KnowledgeSourceType;
  /** Null for pasted text. */
  storage_key: string | null;
  status: KnowledgeSourceStatus;
  created_at: string;
};

export type Conversation = {
  id: string;
  project_id: string;
  visitor_id: string;
  created_at: string;
};

export type Message = {
  id: string;
  conversation_id: string;
  role: MessageRole;
  body: string;
  created_at: string;
};
