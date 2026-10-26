import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

export const planEnum = pgEnum("plan", ["free", "pro"]);
export const widgetPositionEnum = pgEnum("widget_position", [
  "bottom-right",
  "bottom-left",
  "top-right",
  "top-left",
]);
export const widgetAnimationEnum = pgEnum("widget_animation", ["fade", "slide", "scale"]);
export const sourceTypeEnum = pgEnum("source_type", ["text", "pdf", "md", "txt"]);
export const sourceStatusEnum = pgEnum("source_status", ["processing", "ready", "failed"]);
export const messageRoleEnum = pgEnum("message_role", ["visitor", "bot"]);

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// Every table has row-level security on, with no policies: Supabase's Data API (REST, reachable
// with the project's public key) then sees no rows. The app connects as the tables' owner, which
// RLS doesn't apply to (no FORCE), so it's unaffected.
export const accounts = pgTable("accounts", {
  clerkUserId: text("clerk_user_id").primaryKey(),
  plan: planEnum("plan").notNull().default("free"),
  createdAt: createdAt(),
}).enableRLS();

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => accounts.clerkUserId, { onDelete: "cascade" }),
    name: text("name").notNull(),
    publicKey: text("public_key").notNull().unique(),
    messagesUsed: integer("messages_used").notNull().default(0),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index("projects_owner_id_idx").on(t.ownerId)],
).enableRLS();

// Null text fields mean "use the app default" from packages/shared.
export const widgetConfigs = pgTable("widget_configs", {
  projectId: uuid("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  buttonColor: text("button_color"),
  position: widgetPositionEnum("position").notNull().default("bottom-right"),
  label: text("label"),
  animation: widgetAnimationEnum("animation").notNull().default("fade"),
  headerText: text("header_text"),
  showBadge: boolean("show_badge").notNull().default(true),
}).enableRLS();

export const knowledgeSources = pgTable(
  "knowledge_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    type: sourceTypeEnum("type").notNull(),
    // Null for pasted text.
    storageKey: text("storage_key"),
    status: sourceStatusEnum("status").notNull().default("processing"),
    createdAt: createdAt(),
  },
  (t) => [index("knowledge_sources_project_id_idx").on(t.projectId)],
).enableRLS();

export const knowledgeChunks = pgTable(
  "knowledge_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => knowledgeSources.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }).notNull(),
  },
  (t) => [
    index("knowledge_chunks_project_id_idx").on(t.projectId),
    index("knowledge_chunks_source_id_idx").on(t.sourceId),
    index("knowledge_chunks_embedding_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
  ],
).enableRLS();

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    visitorId: text("visitor_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("conversations_project_id_idx").on(t.projectId)],
).enableRLS();

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: messageRoleEnum("role").notNull(),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("messages_conversation_id_idx").on(t.conversationId)],
).enableRLS();
