import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MAX_KNOWLEDGE_FILE_BYTES, PLAN_LIMITS, type KnowledgeSource } from "@askwell/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addFileKnowledge, addTextKnowledge, deleteKnowledgeSource } from "../../lib/data/knowledge-actions";
import { KnowledgeManager } from "./KnowledgeManager";

vi.mock("../../lib/data/knowledge-actions", () => ({
  addTextKnowledge: vi.fn(),
  addFileKnowledge: vi.fn(),
  deleteKnowledgeSource: vi.fn(async () => ({ ok: true })),
}));

const PROJECT = "11111111-2222-4333-8444-555555555555";
let n = 0;
const source = (overrides: Partial<KnowledgeSource> = {}): KnowledgeSource => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
  title: `Source ${n}`,
  type: "pdf",
  status: "ready",
  createdAt: "2026-10-10T10:00:00.000Z",
  ...overrides,
});

beforeEach(() => {
  vi.mocked(addFileKnowledge).mockImplementation(async (_p, file) => ({
    source: source({ title: file.name, status: "processing", type: "pdf" }),
  }));
  vi.mocked(addTextKnowledge).mockImplementation(async (_p, request) => ({
    source: source({ title: request.title, type: "text", status: "processing" }),
  }));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

function renderManager(sources: KnowledgeSource[], { limit = 3, plan = "free" as const } = {}) {
  return render(<KnowledgeManager projectId={PROJECT} initialSources={sources} filesLimit={limit} plan={plan} />);
}

const fileInput = (container: HTMLElement) => container.querySelector<HTMLInputElement>('input[type="file"]')!;

function pick(container: HTMLElement, file: File) {
  return act(async () => {
    fireEvent.change(fileInput(container), { target: { files: [file] } });
  });
}

function sized(name: string, size: number) {
  const file = new File(["x"], name);
  Object.defineProperty(file, "size", { value: size });
  return file;
}

const row = (title: string) => screen.getByText(title).closest("li")!;

describe("KnowledgeManager", () => {
  it("renders an HTML-looking title as text", () => {
    const attack = '<img src=x onerror="alert(1)">';
    const { container } = renderManager([source({ title: attack })]);

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText(attack)).toBeTruthy();
  });

  it("rejects a wrong file type before sending anything", async () => {
    const { container } = renderManager([]);

    await pick(container, new File(["<html>"], "page.html"));

    expect(screen.getByRole("alert").textContent).toMatch(/Only PDF, Markdown/);
    expect(addFileKnowledge).not.toHaveBeenCalled();
  });

  it("rejects an oversized file before sending anything", async () => {
    const { container } = renderManager([]);

    await pick(container, sized("huge.pdf", MAX_KNOWLEDGE_FILE_BYTES + 5 * 1024 * 1024));

    expect(screen.getByRole("alert").textContent).toBe("This file is 15.0 MB. Files can be up to 10 MB.");
    expect(addFileKnowledge).not.toHaveBeenCalled();
  });

  it("disables upload at the Free file limit and links to Billing", () => {
    const { container } = renderManager([source(), source({ type: "md" }), source({ type: "txt" })]);

    expect(screen.getByText("3 of 3 files")).toBeTruthy();
    expect(fileInput(container).disabled).toBe(true);
    expect(screen.getByRole("link", { name: "Upgrade to Pro" }).getAttribute("href")).toBe("/dashboard/billing");
  });

  it("doesn't count pasted text toward the limit, and Pro at its limit gets no upgrade link", () => {
    const { container } = renderManager([source({ type: "text" }), source()], { limit: 1, plan: "pro" as never });

    expect(screen.getByText("1 of 1 files")).toBeTruthy();
    expect(fileInput(container).disabled).toBe(true);
    expect(screen.queryByRole("link", { name: "Upgrade to Pro" })).toBeNull();
  });

  it("uploads a valid file and shows it processing, with no client-side flip to ready", async () => {
    const { container } = renderManager([]);

    await pick(container, new File(["%PDF"], "Handbook.pdf"));

    expect(addFileKnowledge).toHaveBeenCalledOnce();
    expect(within(row("Handbook.pdf")).getByText("Processing")).toBeTruthy();
    expect(screen.getByText("1 of 3 files")).toBeTruthy();
  });

  it("accepts a dropped file", async () => {
    renderManager([]);

    await act(async () => {
      fireEvent.drop(screen.getByText("Upload a file").closest("label")!, {
        dataTransfer: { files: [new File(["# hi"], "notes.md")] },
      });
    });

    expect(addFileKnowledge).toHaveBeenCalledOnce();
    expect(screen.getByText("notes.md")).toBeTruthy();
  });

  it("validates pasted text, then adds it", async () => {
    renderManager([]);
    fireEvent.click(screen.getByRole("button", { name: "Paste text" }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add text" }));
    });
    expect(screen.getByText("Add a title.")).toBeTruthy();
    expect(screen.getByText("Paste some text.")).toBeTruthy();
    expect(addTextKnowledge).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Returns policy" } });
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: "30 days, no questions asked." } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add text" }));
    });

    expect(addTextKnowledge).toHaveBeenCalledWith(PROJECT, {
      type: "text",
      title: "Returns policy",
      content: "30 days, no questions asked.",
    });
    expect(within(row("Returns policy")).getByText("Processing")).toBeTruthy();
  });

  it("shows a failed source with no retry affordance", () => {
    renderManager([source({ title: "Scan.pdf", status: "failed" })]);
    expect(within(row("Scan.pdf")).getByText(/couldn't read this file/)).toBeTruthy();
    expect(within(row("Scan.pdf")).queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("deletes after confirming, and keeps the row when cancelled", async () => {
    const keep = source({ title: "Keep me" });
    const drop = source({ title: "Delete me" });
    renderManager([keep, drop]);

    fireEvent.click(screen.getByRole("button", { name: "Delete Keep me" }));
    expect(screen.getByRole("alertdialog", { name: "Delete Keep me?" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Delete Delete me" }));
    await act(async () => {
      fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete" }));
    });

    expect(deleteKnowledgeSource).toHaveBeenCalledWith(drop.id);
    expect(screen.queryByText("Delete me")).toBeNull();
    expect(screen.getByText("Keep me")).toBeTruthy();
  });

  it("shows an error and keeps the row when delete fails", async () => {
    vi.mocked(deleteKnowledgeSource).mockRejectedValueOnce(new Error("network"));
    renderManager([source({ title: "Keep me" })]);

    fireEvent.click(screen.getByRole("button", { name: "Delete Keep me" }));
    await act(async () => {
      fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete" }));
    });

    expect(within(row("Keep me")).getByText("Couldn't delete this. Try again in a moment.")).toBeTruthy();
  });

  it("reads the Pro file limit in the upgrade message from PLAN_LIMITS", () => {
    renderManager([source(), source({ type: "md" }), source({ type: "txt" })]);
    const message = screen.getByRole("link", { name: "Upgrade to Pro" }).closest("p")!.textContent;
    expect(message).toContain(`for up to ${PLAN_LIMITS.pro.knowledgeFilesPerProject}.`);
  });

  it("explains what Knowledge is for when there are no sources", () => {
    renderManager([]);
    expect(screen.getByText("No knowledge yet")).toBeTruthy();
    expect(screen.getByText(/answers only from what you add here/)).toBeTruthy();
  });
});
