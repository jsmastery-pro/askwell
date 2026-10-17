// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { extractFileText, hasPdfMagicBytes } = await import("./extract");

const samplePdf = readFileSync(fileURLToPath(new URL("./fixtures/sample.pdf", import.meta.url)));

describe("hasPdfMagicBytes", () => {
  it("accepts a real PDF", () => {
    expect(hasPdfMagicBytes(samplePdf)).toBe(true);
  });

  it("rejects a renamed non-PDF file", () => {
    expect(hasPdfMagicBytes(Buffer.from("just some text, not a pdf"))).toBe(false);
  });
});

describe("extractFileText", () => {
  it("extracts text from a real PDF", async () => {
    await expect(extractFileText("pdf", samplePdf)).resolves.toBe("Hello World");
  });

  it("reads md and txt files as UTF-8", async () => {
    await expect(extractFileText("md", Buffer.from("# Title\n\nBody."))).resolves.toBe("# Title\n\nBody.");
    await expect(extractFileText("txt", Buffer.from("Plain text."))).resolves.toBe("Plain text.");
  });
});
