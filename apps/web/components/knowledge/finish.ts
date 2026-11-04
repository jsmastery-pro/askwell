// What the knowledge list does after Finish on an "Upload not finished" row.
// Pure, so the list behaviour is tested without a DOM.
import type { KnowledgeSource } from "@askwell/shared";
import type { FinishOutcome } from "./upload";

export type FinishUpdate = {
  /** The list to show until the server re-read arrives. */
  sources: KnowledgeSource[];
  /** Re-read the list on the server (router.refresh()). */
  refresh: boolean;
  /** A page-level message that outlives the row (the row may be gone). */
  notice: string | null;
};

/** Applies a Finish outcome for `row` to the current list. */
export function applyFinish(sources: KnowledgeSource[], row: KnowledgeSource, outcome: FinishOutcome): FinishUpdate {
  switch (outcome.kind) {
    case "finished":
      return {
        sources: sources.map((s) => (s.id === row.id ? outcome.source : s)),
        refresh: true,
        notice: null,
      };
    case "refused":
      // The server deleted the source and its file: drop the row now, and say why.
      return {
        sources: sources.filter((s) => s.id !== row.id),
        refresh: true,
        notice: `${row.title}: ${outcome.message}`,
      };
    case "gone":
      // Finalized elsewhere or reclaimed: the server's list says which.
      return { sources, refresh: true, notice: null };
    case "error":
      // Nothing changed on the server; the row shows the error and keeps Finish.
      return { sources, refresh: false, notice: null };
  }
}
