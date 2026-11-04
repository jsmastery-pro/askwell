import type { KnowledgeSource } from "@askwell/shared";
import { describe, expect, it, vi } from "vitest";
import { applyFinish } from "./finish";
import { finishUpload, type UploadDeps } from "./upload";

const row = (id: string, overrides: Partial<KnowledgeSource> = {}): KnowledgeSource => ({
  id,
  project_id: "p1",
  title: `file-${id}.pdf`,
  type: "pdf",
  storage_key: `p1/${id}.pdf`,
  status: "ready",
  created_at: "2026-11-04T09:00:00Z",
  ...overrides,
});
const unfinished = row("u", { status: "uploading", title: "northfold.pdf" });
const list = [unfinished, row("a"), row("b")];

const finalizeWith = (result: Awaited<ReturnType<UploadDeps["finalizeUpload"]>>) => ({
  finalizeUpload: vi.fn<UploadDeps["finalizeUpload"]>(async () => result),
});
type Code = "validation_failed" | "not_found" | "internal" | "unauthorized";
const failure = (code: Code, message: string = code) => ({ ok: false as const, error: { code, message } });

/** Finish on the unfinished row against a finalize that answers `result`. */
async function finish(result: Awaited<ReturnType<UploadDeps["finalizeUpload"]>>) {
  const deps = finalizeWith(result);
  const outcome = await finishUpload("p1", unfinished.id, deps);
  expect(deps.finalizeUpload).toHaveBeenCalledExactlyOnceWith("p1", "u");
  return { outcome, update: applyFinish(list, unfinished, outcome) };
}

describe("Finish on an \"Upload not finished\" row", () => {
  it("success: finalize with the same source id, show the returned source, refresh", async () => {
    const ready = { ...unfinished, status: "ready" as const };
    const { outcome, update } = await finish({ ok: true, data: ready });
    expect(outcome).toEqual({ kind: "finished", source: ready });
    expect(update).toEqual({ sources: [ready, list[1], list[2]], refresh: true, notice: null });
  });

  it("400 (the file never arrived): the server's message as a notice, the row dropped, refresh", async () => {
    const { outcome, update } = await finish(failure("validation_failed", "The file wasn't uploaded. Try again."));
    expect(outcome).toEqual({ kind: "refused", message: "The file wasn't uploaded. Try again." });
    expect(update.sources.map((s) => s.id)).toEqual(["a", "b"]);
    expect(update.refresh).toBe(true);
    expect(update.notice).toBe("northfold.pdf: The file wasn't uploaded. Try again.");
  });

  it("404 (already finalized or reclaimed): refresh, and let the server's list decide", async () => {
    const { outcome, update } = await finish(failure("not_found"));
    expect(outcome).toEqual({ kind: "gone" });
    expect(update).toEqual({ sources: list, refresh: true, notice: null });
  });

  it.each(["internal", "unauthorized"] as const)("%s: nothing changed, so no refresh (the row shows the error)", async (code) => {
    const { outcome, update } = await finish(failure(code));
    expect(outcome).toEqual({ kind: "error", error: { code, message: code } });
    expect(update).toEqual({ sources: list, refresh: false, notice: null });
  });
});
