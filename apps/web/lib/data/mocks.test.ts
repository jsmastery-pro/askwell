import {
  addKnowledgeResponseSchema,
  checkoutResponseSchema,
  deleteKnowledgeResponseSchema,
  getConversationResponseSchema,
  knowledgeSourceSchema,
  listConversationsResponseSchema,
  portalResponseSchema,
  SOURCE_STATUSES,
  SOURCE_TYPES,
  updateWidgetConfigResponseSchema,
  WIDGET_DEFAULTS,
} from "@askwell/shared";
import { describe, expect, it, vi } from "vitest";
import { MOCK_THREADS } from "../mock/conversations";
import { openBillingPortal, startCheckout } from "./billing-actions";
import { saveWidgetConfig } from "./config-actions";
import { getConversation, listConversations } from "./conversations";
import { addFileKnowledge, addTextKnowledge, deleteKnowledgeSource } from "./knowledge-actions";
import { countKnowledgeFiles, listKnowledgeSources } from "./knowledge";

vi.mock("server-only", () => ({}));
vi.mock("./demo", () => ({ demoDelay: async () => {} }));

const PROJECT = "11111111-2222-4333-8444-555555555555";

describe("mock reads match their shared schemas", () => {
  it("knowledge sources cover every type and status", async () => {
    const sources = await listKnowledgeSources(PROJECT);
    for (const source of sources) knowledgeSourceSchema.parse(source);
    expect(new Set(sources.map((s) => s.type))).toEqual(new Set(SOURCE_TYPES));
    expect(new Set(sources.map((s) => s.status))).toEqual(new Set(SOURCE_STATUSES));
  });

  it("returns nothing for a malformed project ID", async () => {
    expect(await listKnowledgeSources("abc")).toEqual([]);
    expect(await countKnowledgeFiles("abc")).toBe(0);
  });

  it("counts only uploaded files toward the file limit", async () => {
    const sources = await listKnowledgeSources(PROJECT);
    expect(await countKnowledgeFiles(PROJECT)).toBe(sources.filter((s) => s.type !== "text").length);
  });

  it("conversation summaries are newest first", async () => {
    const conversations = await listConversations(PROJECT);
    listConversationsResponseSchema.parse({ conversations });
    const times = conversations.map((c) => Date.parse(c.createdAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it("every thread parses, and an unknown ID returns null", async () => {
    for (const thread of MOCK_THREADS) {
      getConversationResponseSchema.parse({ conversation: await getConversation(PROJECT, thread.id) });
    }
    expect(await getConversation(PROJECT, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("includes HTML-looking text so screens prove they render it as text", () => {
    const bodies = MOCK_THREADS.flatMap((t) => t.messages.map((m) => m.body));
    expect(bodies.some((body) => /<[a-z]/i.test(body))).toBe(true);
  });
});

describe("mock writes match their shared schemas", () => {
  it("knowledge writes", async () => {
    addKnowledgeResponseSchema.parse(await addTextKnowledge(PROJECT, { type: "text", title: "FAQ", content: "Hi" }));
    const file = await addFileKnowledge(PROJECT, new File(["%PDF"], "guide.pdf"));
    addKnowledgeResponseSchema.parse(file);
    expect(file.source.type).toBe("pdf");
    deleteKnowledgeResponseSchema.parse(await deleteKnowledgeSource(PROJECT));
  });

  it("config save, including null resetting a field to its default", async () => {
    const current = { ...WIDGET_DEFAULTS, label: "Ask us" };
    const saved = await saveWidgetConfig(PROJECT, current, { label: null, position: "top-left" });
    updateWidgetConfigResponseSchema.parse(saved);
    expect(saved.config.label).toBe(WIDGET_DEFAULTS.label);
    expect(saved.config.position).toBe("top-left");
  });

  it("billing URLs", async () => {
    checkoutResponseSchema.parse(await startCheckout());
    portalResponseSchema.parse(await openBillingPortal());
  });
});
