import { MAX_KNOWLEDGE_FILE_BYTES } from "@askwell/shared";
import { describe, expect, it } from "vitest";
import { checkFile, checkText, formatBytes } from "./validate";

describe("checkFile", () => {
  it.each(["guide.pdf", "notes.md", "faq.txt", "SHOUTY.PDF", "my.report.v2.md"])("accepts %s", (name) => {
    expect(checkFile({ name, size: 1000 })).toBeNull();
  });

  it.each(["slides.pptx", "page.html", "photo.png", "README", ".pdf", "archive.pdf.zip"])(
    "rejects the type of %s",
    (name) => {
      expect(checkFile({ name, size: 1000 })).toMatch(/Only PDF, Markdown/);
    },
  );

  it("rejects a file over the size limit and says how big it is", () => {
    expect(checkFile({ name: "big.pdf", size: MAX_KNOWLEDGE_FILE_BYTES + 1 })).toBe(
      "This file is 4.0 MB. Files can be up to 4 MB.",
    );
    expect(checkFile({ name: "huge.pdf", size: 24 * 1024 * 1024 })).toMatch(/24\.0 MB/);
  });

  it("accepts a file exactly at the limit and rejects an empty one", () => {
    expect(checkFile({ name: "max.pdf", size: MAX_KNOWLEDGE_FILE_BYTES })).toBeNull();
    expect(checkFile({ name: "empty.txt", size: 0 })).toBe("This file is empty.");
  });
});

describe("checkText", () => {
  it("returns the request for valid input, trimmed", () => {
    expect(checkText("  FAQ ", " Hello ")).toEqual({
      ok: true,
      request: { type: "text", title: "FAQ", content: "Hello" },
    });
  });

  it("explains each missing or invalid field", () => {
    expect(checkText("  ", "")).toEqual({ ok: false, errors: { title: "Add a title.", content: "Paste some text." } });
    expect(checkText("x".repeat(121), "ok")).toEqual({
      ok: false,
      errors: { title: "Keep the title under 120 characters." },
    });
  });
});

describe("formatBytes", () => {
  it("uses KB below a megabyte and MB above", () => {
    expect(formatBytes(500)).toBe("1 KB");
    expect(formatBytes(300 * 1024)).toBe("300 KB");
    expect(formatBytes(3.5 * 1024 * 1024)).toBe("3.5 MB");
  });
});
