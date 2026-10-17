import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as schema from "./index";

const tables = [
  schema.accounts,
  schema.projects,
  schema.widgetConfigs,
  schema.knowledgeSources,
  schema.knowledgeChunks,
  schema.conversations,
  schema.messages,
].map((t) => getTableConfig(t));

describe("schema", () => {
  // rate_limits was dropped when Arcjet took over the widget rate limits (P3-T07).
  it("defines exactly the 7 tables from project.md §7", () => {
    expect(tables.map((t) => t.name).sort()).toEqual(
      [
        "accounts",
        "conversations",
        "knowledge_chunks",
        "knowledge_sources",
        "messages",
        "projects",
        "widget_configs",
      ].sort(),
    );
  });

  it("makes projects.public_key unique", () => {
    const projects = tables.find((t) => t.name === "projects");
    expect(projects?.columns.find((c) => c.name === "public_key")?.isUnique).toBe(true);
  });

  it("stores embeddings as vector(1536) with an HNSW index", () => {
    const chunks = tables.find((t) => t.name === "knowledge_chunks");
    expect(chunks?.columns.find((c) => c.name === "embedding")?.getSQLType()).toBe("vector(1536)");
    const hnsw = chunks?.indexes.find((i) => i.config.name === "knowledge_chunks_embedding_idx");
    expect(hnsw?.config.method).toBe("hnsw");
  });
});
