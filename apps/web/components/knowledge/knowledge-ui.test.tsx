import type { KnowledgeSource } from "@askwell/shared";
import { KNOWLEDGE_TITLE_MAX_LENGTH, MAX_KNOWLEDGE_FILE_BYTES, PLAN_LIMITS } from "@askwell/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  addErrorText,
  deleteErrorText,
  finishErrorText,
  knowledgeLimitPrompt,
  sourceCountText,
  statusView,
  uploadFailureView,
} from "./display";
import { checkFile, FILE_ACCEPT } from "./files";
import { KnowledgeManager, KnowledgeLimitNotice } from "./KnowledgeManager";
import { KnowledgeSkeleton } from "./KnowledgeSkeleton";
import { SourceRow, StatusBadge } from "./SourceRow";
import { UploadFileForm } from "./UploadFileForm";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));

const source = (id: string, overrides: Partial<KnowledgeSource> = {}): KnowledgeSource => ({
  id,
  project_id: "p1",
  title: `Source ${id}`,
  type: "pdf",
  storage_key: `p1/${id}.pdf`,
  status: "ready",
  created_at: "2026-11-04T09:00:00Z",
  ...overrides,
});

const free = PLAN_LIMITS.free.knowledgeSources;
const noop = () => undefined;

function manager(sources: KnowledgeSource[], plan: "free" | "pro" = "free") {
  return renderToStaticMarkup(
    <KnowledgeManager projectId="p1" initialSources={sources} plan={plan} limit={PLAN_LIMITS[plan].knowledgeSources} />,
  );
}

/** The `tag` start tags whose markup contains `marker`. */
const tagsWith = (html: string, tag: string, marker: string) =>
  (html.match(new RegExp(`<${tag}[^>]*>`, "g")) ?? []).filter((t) => t.includes(marker));

/** Has the disabled attribute (not just a `disabled:` class). */
const DISABLED = /\sdisabled=""/;

describe("KnowledgeManager", () => {
  it("shows both add forms, the count and the empty state when there are no sources", () => {
    const html = manager([]);
    expect(html).toContain("Paste text");
    expect(html).toContain("Upload a file");
    expect(html).toContain(`0 of ${free} sources`);
    expect(html).toContain("No knowledge yet");
    expect(html).not.toContain('aria-label="Knowledge sources"');
    expect(html).toMatch(/<button[^>]*>Refresh<\/button>/);
  });

  it("lists each source with title, type, status and created date, in the given order", () => {
    const html = manager([
      source("a", { title: "Pricing", type: "text", storage_key: null }),
      source("b", { title: "Handbook", status: "processing" }),
    ]);
    expect(html).toContain('aria-label="Knowledge sources"');
    expect(html.indexOf("Pricing")).toBeLessThan(html.indexOf("Handbook"));
    expect(html).toContain("Pasted text");
    expect(html).toContain("PDF");
    expect(html).toContain('<time dateTime="2026-11-04T09:00:00Z">Nov 4, 2026</time>');
    expect(html).toContain(">Ready<");
    expect(html).toContain(">Processing<");
    expect(html).toContain(`2 of ${free} sources`);
    expect(html).not.toContain("No knowledge yet");
  });

  it("renders a source title as text, never HTML", () => {
    const html = manager([source("x", { title: "<img src=x onerror=alert(1)>" })]);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("Free under the limit: add actions enabled, no limit notice", () => {
    const html = manager([source("a"), source("b")]);
    expect(html).not.toContain(knowledgeLimitPrompt("free").message);
    expect(tagsWith(html, "input", 'type="file"')[0]).not.toMatch(DISABLED);
    expect(tagsWith(html, "textarea", "maxLength")[0]).not.toMatch(DISABLED);
  });

  it(`Free at ${free} sources: add actions disabled, with the reason and an upgrade link`, () => {
    const html = manager([source("a"), source("b"), source("c")]);
    expect(html).toContain(`${free} of ${free} sources`);
    expect(html).toContain(knowledgeLimitPrompt("free").message);
    expect(html).toMatch(/<a[^>]*href="\/dashboard\/billing"[^>]*>Upgrade to Pro<\/a>/);
    expect(tagsWith(html, "input", 'type="file"')[0]).toMatch(DISABLED);
    expect(tagsWith(html, "textarea", "maxLength")[0]).toMatch(DISABLED);
    for (const label of ["Add text", "Upload"]) {
      const button = (html.match(/<button[^>]*>[^<]*<\/button>/g) ?? []).find((b) => b.endsWith(`>${label}</button>`));
      expect(button, label).toMatch(DISABLED);
    }
    // Delete stays available: it's how to get under the limit.
    expect(html.match(/>Delete</g)).toHaveLength(3);
  });

  it("Pro with 3 sources is under its limit", () => {
    const html = manager([source("a"), source("b"), source("c")], "pro");
    expect(html).toContain(`3 of ${PLAN_LIMITS.pro.knowledgeSources} sources`);
    expect(html).not.toContain("Upgrade to Pro");
    expect(tagsWith(html, "input", 'type="file"')[0]).not.toMatch(DISABLED);
  });

  it("limits the inputs with the shared limits and accepts only PDF/MD/TXT", () => {
    const html = manager([]);
    expect(tagsWith(html, "input", 'type="file"')[0]).toContain(`accept="${FILE_ACCEPT}"`);
    expect(FILE_ACCEPT).toBe(".pdf,.md,.txt,application/pdf,text/markdown,text/x-markdown,text/plain");
    expect(html).toContain("PDF, MD, TXT, up to 10 MB.");
  });
});

describe("SourceRow", () => {
  it("shows Delete, then a confirm step naming the source", () => {
    const view = renderToStaticMarkup(<SourceRow source={source("a", { title: "FAQ" })} onDeleted={noop} onFinished={noop} />);
    expect(view).toMatch(/<button[^>]*>Delete<\/button>/);
    expect(view).not.toContain("Confirm delete");

    const confirm = renderToStaticMarkup(
      <SourceRow source={source("a", { title: "FAQ" })} onDeleted={noop} onFinished={noop} initialConfirming />,
    );
    expect(confirm).toContain('aria-label="Confirm delete"');
    expect(confirm).toContain("<strong");
    expect(confirm).toContain(">FAQ</strong>");
    expect(confirm).toMatch(/>Delete source</);
    expect(confirm).toMatch(/>Cancel</);
  });

  it("an uploading row shows \"Upload not finished\" with Finish and Delete", () => {
    const html = renderToStaticMarkup(
      <SourceRow source={source("a", { status: "uploading", title: "<b>guide</b>.pdf" })} onDeleted={noop} onFinished={noop} />,
    );
    expect(html).toContain(">Upload not finished<");
    expect(html).not.toContain(">Processing<");
    expect(html).toMatch(/<button[^>]*>Finish<\/button>/);
    expect(html).toMatch(/<button[^>]*>Delete<\/button>/);
    expect(html).toContain("didn&#x27;t finish");
    // The title is text, never HTML.
    expect(html).toContain("&lt;b&gt;guide&lt;/b&gt;.pdf");
    expect(html).not.toContain("<b>guide</b>");
  });

  it("a processing or ready row has no Finish", () => {
    for (const status of ["processing", "ready", "failed"] as const) {
      const html = renderToStaticMarkup(<SourceRow source={source("a", { status })} onDeleted={noop} onFinished={noop} />);
      expect(html).not.toMatch(/>Finish</);
    }
    expect(renderToStaticMarkup(<StatusBadge status="processing" />)).toContain("Processing");
  });

  it("the confirm step on an uploading row hides Finish", () => {
    const html = renderToStaticMarkup(
      <SourceRow source={source("a", { status: "uploading" })} onDeleted={noop} onFinished={noop} initialConfirming />,
    );
    expect(html).toContain('aria-label="Confirm delete"');
    expect(html).not.toMatch(/>Finish</);
  });

  it("shows an error state for a failed source", () => {
    const html = renderToStaticMarkup(<SourceRow source={source("a", { status: "failed" })} onDeleted={noop} onFinished={noop} />);
    expect(html).toContain(">Failed");
    expect(html).toContain("<svg");
    expect(html).toContain("couldn&#x27;t read this source");
  });
});

describe("StatusBadge and statusView", () => {
  it.each([
    ["uploading", "Upload not finished", "pending"],
    ["processing", "Processing", "pending"],
    ["ready", "Ready", "ready"],
    ["failed", "Failed", "failed"],
  ] as const)("%s shows as %s", (status, label, tone) => {
    expect(statusView(status)).toEqual({ label, tone });
    expect(renderToStaticMarkup(<StatusBadge status={status} />)).toContain(label);
  });
});

describe("limit words", () => {
  it("counts with PLAN_LIMITS numbers", () => {
    expect(sourceCountText(1, 1)).toBe("1 of 1 source");
    expect(sourceCountText(2, 25)).toBe("2 of 25 sources");
    expect(knowledgeLimitPrompt("free")).toEqual({
      message: `Free includes ${free} sources per project. Delete one to add another, or upgrade to Pro for ${PLAN_LIMITS.pro.knowledgeSources}.`,
      upgrade: true,
    });
    expect(knowledgeLimitPrompt("pro")).toEqual({
      message: `Pro includes ${PLAN_LIMITS.pro.knowledgeSources} sources per project. Delete one to add another.`,
      upgrade: false,
    });
  });

  it("the limit notice links to billing on Free only", () => {
    expect(renderToStaticMarkup(<KnowledgeLimitNotice plan="free" />)).toContain('href="/dashboard/billing"');
    expect(renderToStaticMarkup(<KnowledgeLimitNotice plan="pro" />)).not.toContain("href=");
  });
});

describe("error words", () => {
  it("switches on the §8 code", () => {
    const err = (code: Parameters<typeof addErrorText>[0]["code"], message = "m") => ({ code, message });
    expect(addErrorText(err("plan_limit_reached"), "file")).toMatch(/source limit/);
    expect(addErrorText(err("unauthorized"), "text")).toMatch(/Sign in again/);
    expect(addErrorText(err("validation_failed"), "text")).toMatch(/title of up to 200 characters and text of up to 50,000/);
    expect(addErrorText(err("validation_failed", "Allowed file types: pdf, md, txt"), "file")).toBe(
      "Allowed file types: pdf, md, txt",
    );
    expect(addErrorText(err("internal"), "file")).toBe("Couldn't upload the file. Try again.");
    expect(deleteErrorText(err("not_found"))).toMatch(/no longer exists/);
    expect(deleteErrorText(err("internal"))).toBe("Couldn't delete the source. Try again.");
    expect(finishErrorText(err("unauthorized"))).toMatch(/Sign in again/);
    expect(finishErrorText(err("internal"))).toBe("Couldn't finish the upload. Try again.");
  });
});

describe("checkFile", () => {
  it.each([
    ["guide.pdf", "application/pdf", "application/pdf"],
    ["README.MD", "", "text/markdown"],
    ["notes.md", "text/plain", "text/plain"],
    ["notes.md", "application/octet-stream", "text/markdown"],
    ["faq.txt", "text/plain", "text/plain"],
  ])("accepts %s (%s) and declares %s", (name, type, mimeType) => {
    expect(checkFile({ name, size: 100, type })).toMatchObject({ ok: true, mimeType });
  });

  it.each([
    ["a .docx", { name: "a.docx", size: 100, type: "application/msword" }, /isn't supported/],
    ["no extension", { name: "README", size: 100, type: "text/plain" }, /isn't supported/],
    ["over 10 MB", { name: "big.pdf", size: MAX_KNOWLEDGE_FILE_BYTES + 1, type: "application/pdf" }, /over 10 MB/],
    ["an empty file", { name: "e.txt", size: 0, type: "text/plain" }, /empty/],
    [
      "a name over KNOWLEDGE_TITLE_MAX_LENGTH",
      { name: `${"n".repeat(KNOWLEDGE_TITLE_MAX_LENGTH)}.pdf`, size: 100, type: "application/pdf" },
      /file name is too long\. Rename the file to 200 characters or fewer/,
    ],
  ])("refuses %s", (_label, file, message) => {
    const result = checkFile(file);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(message);
  });

  it("allows a name of exactly KNOWLEDGE_TITLE_MAX_LENGTH characters", () => {
    const name = `${"n".repeat(KNOWLEDGE_TITLE_MAX_LENGTH - 4)}.pdf`;
    expect(checkFile({ name, size: 100, type: "application/pdf" }).ok).toBe(true);
  });

  it("allows exactly 10 MB", () => {
    expect(checkFile({ name: "max.pdf", size: MAX_KNOWLEDGE_FILE_BYTES, type: "application/pdf" }).ok).toBe(true);
  });
});

describe("uploadFailureView", () => {
  const error = (code: "internal" | "validation_failed" | "plan_limit_reached", message = "m") => ({ code, message });

  it("a check or reserve failure changes nothing on the server: no refresh, no retry", () => {
    expect(uploadFailureView({ ok: false, step: "reserve", error: error("plan_limit_reached") })).toEqual({
      text: "This project is at its source limit. Delete a source to add another.",
      refresh: false,
      retrySourceId: null,
    });
  });

  it("an upload failure refreshes the list", () => {
    expect(uploadFailureView({ ok: false, step: "upload", error: error("internal"), pendingSourceId: null })).toEqual({
      text: "Couldn't upload the file. Try again.",
      refresh: true,
      retrySourceId: null,
    });
  });

  it("an upload failure whose reservation couldn't be deleted says to delete the pending source", () => {
    expect(uploadFailureView({ ok: false, step: "upload", error: error("internal"), pendingSourceId: "s1" })).toEqual({
      text: "Couldn't upload the file. Try again. Delete the pending source below.",
      refresh: true,
      retrySourceId: null,
    });
  });

  it("a finalize server or network error offers a retry with the same source", () => {
    expect(uploadFailureView({ ok: false, step: "finalize", error: error("internal"), pendingSourceId: "s1" })).toEqual({
      text: "Couldn't upload the file. Try again.",
      refresh: true,
      retrySourceId: "s1",
    });
  });

  it("a refused file at finalize offers no retry", () => {
    const view = uploadFailureView({
      ok: false,
      step: "finalize",
      error: error("validation_failed", "That PDF can't be read."),
      pendingSourceId: "s1",
    });
    expect(view).toEqual({ text: "That PDF can't be read.", refresh: true, retrySourceId: null });
  });
});

describe("UploadFileForm", () => {
  it("shows Retry after a failed finalize, even at the source limit", () => {
    const html = renderToStaticMarkup(
      <UploadFileForm projectId="p1" disabled onUploaded={noop} onChanged={noop} initialRetrySourceId="s1" />,
    );
    const retry = (html.match(/<button[^>]*>[^<]*<\/button>/g) ?? []).find((b) => b.endsWith(">Retry</button>"));
    expect(retry).toBeDefined();
    expect(retry).not.toMatch(DISABLED);
  });

  it("shows no Retry by default", () => {
    const html = renderToStaticMarkup(<UploadFileForm projectId="p1" disabled={false} onUploaded={noop} onChanged={noop} />);
    expect(html).not.toContain(">Retry<");
  });
});

describe("KnowledgeSkeleton", () => {
  it("is a labelled loading status", () => {
    expect(renderToStaticMarkup(<KnowledgeSkeleton />)).toContain('role="status" aria-label="Loading knowledge"');
  });
});
