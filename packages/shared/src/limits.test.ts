import { describe, expect, it } from "vitest";
import {
  ALLOWED_FILE_EXTENSIONS,
  ALLOWED_FILE_MIME_TYPES,
  API_ERROR_CODES,
  API_ERROR_STATUS,
  MAX_FILE_BYTES,
  MAX_KNOWLEDGE_FILE_BYTES,
  MAX_MESSAGE_LENGTH,
  MAX_PASTED_TEXT_LENGTH,
  PROJECT_NAME_MAX_LENGTH,
  PROJECT_NAME_MIN_LENGTH,
} from "./index";

describe("limits", () => {
  it("match project.md", () => {
    expect(MAX_MESSAGE_LENGTH).toBe(1000);
    expect(MAX_PASTED_TEXT_LENGTH).toBe(50_000);
    expect(MAX_KNOWLEDGE_FILE_BYTES).toBe(10 * 1024 * 1024);
    expect(MAX_FILE_BYTES).toBe(MAX_KNOWLEDGE_FILE_BYTES);
    expect(ALLOWED_FILE_EXTENSIONS).toEqual(["pdf", "md", "txt"]);
    expect(PROJECT_NAME_MIN_LENGTH).toBe(1);
    expect(PROJECT_NAME_MAX_LENGTH).toBe(60);
  });

  it("lists each MIME type once", () => {
    expect(new Set(ALLOWED_FILE_MIME_TYPES).size).toBe(ALLOWED_FILE_MIME_TYPES.length);
    expect(ALLOWED_FILE_MIME_TYPES).toContain("application/pdf");
  });
});

describe("API errors", () => {
  it("map every code to a status", () => {
    for (const code of API_ERROR_CODES) {
      expect(API_ERROR_STATUS[code]).toBeGreaterThanOrEqual(400);
    }
    expect(API_ERROR_STATUS.payment_required).toBe(402);
    expect(API_ERROR_STATUS.rate_limited).toBe(429);
  });
});
