// What the knowledge list does after Finish on an "Upload not finished" row.
// Pure, so the list behaviour is tested without a DOM.
import type { KnowledgeSource } from "@askwell/shared";
import type { FinishOutcome } from "./upload";

/**
 * The list after a Finish outcome for `row`. Pass it to a functional
 * setState, so two Finishes resolving together each apply to the latest list.
 */
export function finishSources(
  sources: KnowledgeSource[],
  row: KnowledgeSource,
  outcome: FinishOutcome,
): KnowledgeSource[] {
  switch (outcome.kind) {
    case "finished":
      return sources.map((s) => (s.id === row.id ? outcome.source : s));
    case "refused":
      // The server deleted the source and its file: drop the row now.
      return sources.filter((s) => s.id !== row.id);
    case "gone":
    case "error":
      // The server's list says what happened (see finishEffects).
      return sources;
  }
}

export type FinishEffects = {
  /** Re-read the list on the server (router.refresh()). */
  refresh: boolean;
  /** A page-level message that outlives the row (the row may be gone). */
  notice: string | null;
};

/** What else a Finish outcome does. Every outcome re-reads the list. */
export function finishEffects(row: KnowledgeSource, outcome: FinishOutcome): FinishEffects {
  switch (outcome.kind) {
    case "refused":
      return { refresh: true, notice: `${row.title}: ${outcome.message}` };
    case "finished":
    case "gone":
      // gone: finalized elsewhere or reclaimed.
      return { refresh: true, notice: null };
    case "error":
      // Ambiguous: finalize may have claimed the source and then marked it
      // "failed" before erroring. The row shows the error; the re-read shows
      // the source's real status (and drops Finish if it's no longer uploading).
      return { refresh: true, notice: null };
  }
}
