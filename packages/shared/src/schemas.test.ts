import { describe, expect, it } from "vitest";
import type { z } from "zod";
import {
  clerkWebhookBody,
  createProjectBody,
  createTextSourceBody,
  createUploadUrlBody,
  fileExtension,
  finalizeUploadBody,
  idParams,
  MAX_KNOWLEDGE_FILE_BYTES,
  MAX_MESSAGE_LENGTH,
  MAX_PASTED_TEXT_LENGTH,
  updateProjectBody,
  updateWidgetConfigBody,
  widgetChatBody,
  widgetConfigQuery,
} from "./index";

const ID = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
const KEY = "pk_a1B2c3D4e5F6g7H8";

type Case = { name: string; schema: z.ZodType; valid: unknown[]; invalid: unknown[] };

const cases: Case[] = [
  {
    name: "idParams (/:id routes)",
    schema: idParams,
    valid: [{ id: ID }],
    invalid: [{ id: "123" }, {}, { id: ID, extra: 1 }],
  },
  {
    name: "widgetConfigQuery (GET /api/widget/config)",
    schema: widgetConfigQuery,
    valid: [{ key: KEY }],
    invalid: [{ key: "sk_secret" }, { key: "pk_" }, { key: "pk_has space" }, {}],
  },
  {
    name: "widgetChatBody (POST /api/widget/chat)",
    schema: widgetChatBody,
    valid: [
      { key: KEY, visitorId: "v_123", message: "Hi" },
      { key: KEY, visitorId: "v_123", conversationId: ID, message: "x".repeat(MAX_MESSAGE_LENGTH) },
    ],
    invalid: [
      { key: KEY, visitorId: "v_123", message: "x".repeat(MAX_MESSAGE_LENGTH + 1) },
      { key: KEY, visitorId: "v_123", message: "   " },
      { key: "bad", visitorId: "v_123", message: "Hi" },
      { key: KEY, visitorId: "v_123", conversationId: "nope", message: "Hi" },
      { key: KEY, visitorId: "<script>", message: "Hi" },
      { key: KEY, visitorId: "v_123", message: "Hi", plan: "pro" },
    ],
  },
  {
    name: "createProjectBody (POST /api/projects)",
    schema: createProjectBody,
    valid: [{ name: "My site" }, { name: "x".repeat(60) }],
    invalid: [{ name: "" }, { name: "   " }, { name: "x".repeat(61) }, { name: "Ok", owner_id: "u" }],
  },
  {
    name: "updateProjectBody (PATCH /api/projects/:id)",
    schema: updateProjectBody,
    valid: [{ name: "Renamed" }],
    invalid: [{}, { name: "Renamed", public_key: KEY }],
  },
  {
    name: "createTextSourceBody (POST /api/projects/:id/knowledge)",
    schema: createTextSourceBody,
    valid: [{ title: "FAQ", text: "We ship worldwide." }],
    invalid: [
      { title: "FAQ", text: "x".repeat(MAX_PASTED_TEXT_LENGTH + 1) },
      { title: "", text: "Some text" },
      { title: "FAQ", text: "" },
    ],
  },
  {
    name: "createUploadUrlBody (POST /api/projects/:id/knowledge/upload-url)",
    schema: createUploadUrlBody,
    valid: [
      { fileName: "guide.pdf", sizeBytes: 2048, mimeType: "application/pdf" },
      { fileName: "README.MD", sizeBytes: 10, mimeType: "text/markdown" },
      { fileName: "notes.txt", sizeBytes: MAX_KNOWLEDGE_FILE_BYTES, mimeType: "text/plain" },
    ],
    invalid: [
      { fileName: "big.pdf", sizeBytes: MAX_KNOWLEDGE_FILE_BYTES + 1, mimeType: "application/pdf" },
      { fileName: "run.exe", sizeBytes: 10, mimeType: "application/octet-stream" },
      { fileName: "noext", sizeBytes: 10, mimeType: "text/plain" },
      { fileName: "fake.pdf", sizeBytes: 10, mimeType: "text/html" },
      { fileName: "empty.txt", sizeBytes: 0, mimeType: "text/plain" },
    ],
  },
  {
    name: "finalizeUploadBody (POST /api/projects/:id/knowledge/finalize)",
    schema: finalizeUploadBody,
    valid: [{ sourceId: ID }],
    invalid: [{ sourceId: "x" }, {}],
  },
  {
    name: "updateWidgetConfigBody (PATCH /api/projects/:id/config)",
    schema: updateWidgetConfigBody,
    valid: [
      { button_color: "#1a2B3c" },
      {
        button_color: "#ffffff",
        position: "top-left",
        label: "Help",
        animation: "slide",
        header_text: "Hello",
        show_badge: false,
      },
    ],
    invalid: [
      {},
      { button_color: "red" },
      { button_color: "#fff" },
      { position: "center" },
      { animation: "bounce" },
      { label: "" },
      { label: "x".repeat(41) },
      { show_badge: "no" },
      { project_id: ID },
    ],
  },
  {
    name: "clerkWebhookBody (POST /api/clerk/webhook)",
    schema: clerkWebhookBody,
    valid: [
      {
        type: "subscription.active",
        data: { id: "csub_1", payer: { user_id: "user_1" }, items: [{ plan: { slug: "pro" } }] },
      },
      { type: "subscriptionItem.canceled", data: { payer: { user_id: "user_1" }, plan: { slug: "pro" } } },
    ],
    invalid: [{ data: {} }, { type: "subscription.active" }, { type: "", data: {} }],
  },
];

describe.each(cases)("$name", ({ schema, valid, invalid }) => {
  it.each(valid)("accepts %j", (input) => {
    expect(schema.safeParse(input).success).toBe(true);
  });
  it.each(invalid)("rejects %j", (input) => {
    expect(schema.safeParse(input).success).toBe(false);
  });
});

describe("trimming", () => {
  it("trims the project name and chat message", () => {
    expect(createProjectBody.parse({ name: "  Site  " }).name).toBe("Site");
    expect(widgetChatBody.parse({ key: KEY, visitorId: "v", message: " Hi " }).message).toBe("Hi");
  });
});

describe("fileExtension", () => {
  it("reads the last extension, lower case", () => {
    expect(fileExtension("a.b.PDF")).toBe("pdf");
    expect(fileExtension("noext")).toBeNull();
    expect(fileExtension(".env")).toBeNull();
    expect(fileExtension("trailing.")).toBeNull();
  });
});
