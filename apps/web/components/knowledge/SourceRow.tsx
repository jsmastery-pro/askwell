"use client";

import { useState } from "react";
import type { KnowledgeSource } from "@askwell/shared";
import { Button } from "../ui";
import { cx } from "../ui/cx";
import { AlertIcon } from "../ui/icons";
import { messageClasses } from "../projects/fields";
import { formatCreatedDate } from "../projects/format";
import { deleteSource } from "./api";
import { deleteErrorText, finishErrorText, statusView, TYPE_LABELS, type StatusTone } from "./display";
import { finishUpload, type FinishOutcome } from "./upload";

const toneClasses: Record<StatusTone, string> = {
  pending: "border-line-strong text-fg-muted",
  ready: "border-transparent bg-primary text-primary-fg",
  failed: "border-fg text-fg",
};

/** The status pill. Failed carries an icon, so it doesn't rely on color alone. */
export function StatusBadge({ status, inFlight = false }: { status: KnowledgeSource["status"]; inFlight?: boolean }) {
  const { label, tone } = statusView(status, inFlight);
  return (
    <span
      className={cx(
        "inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 text-xs font-medium",
        toneClasses[tone],
      )}
    >
      {tone === "failed" ? <AlertIcon aria-hidden="true" className="size-3.5" /> : null}
      {label}
    </span>
  );
}

export interface SourceRowProps {
  source: KnowledgeSource;
  onDeleted: (id: string) => void;
  /** Finish ran on this "Upload not finished" row and changed something (any outcome but an error). */
  onFinished: (source: KnowledgeSource, outcome: FinishOutcome) => void;
  /**
   * This page's upload form is still uploading this source. It shows
   * "Uploading…" with no Finish and Delete disabled until the form's flow
   * ends: finishing or deleting it now would destroy the file being sent.
   */
  inFlight?: boolean;
  /** Start on the confirm step (tests). */
  initialConfirming?: boolean;
}

/**
 * One source: title (as text), type, status, created date, and delete with a
 * confirm step. An `uploading` row ("Upload not finished") also has Finish.
 */
export function SourceRow({ source, onDeleted, onFinished, inFlight = false, initialConfirming = false }: SourceRowProps) {
  const [confirming, setConfirming] = useState(initialConfirming);
  const [pending, setPending] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const failed = source.status === "failed";
  const unfinished = source.status === "uploading" && !inFlight;

  async function finish() {
    setFinishing(true);
    setError(null);
    const outcome = await finishUpload(source.project_id, source.id);
    setFinishing(false);
    if (outcome.kind === "error") setError(finishErrorText(outcome.error));
    else onFinished(source, outcome);
  }

  async function remove() {
    setPending(true);
    setError(null);
    const result = await deleteSource(source.id);
    setPending(false);
    if (result.ok) onDeleted(result.data);
    else setError(deleteErrorText(result.error));
  }

  return (
    <li className="flex min-w-0 flex-col gap-3 px-5 py-4" aria-label={source.title}>
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="min-w-0 break-words text-sm font-medium text-fg">{source.title}</p>
          <p className="text-xs text-fg-muted">
            {TYPE_LABELS[source.type]} · Added{" "}
            <time dateTime={source.created_at}>{formatCreatedDate(source.created_at)}</time>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusBadge status={source.status} inFlight={inFlight} />
          {unfinished && !confirming ? (
            <Button variant="secondary" size="sm" loading={finishing} onClick={finish}>
              Finish
            </Button>
          ) : null}
          {confirming ? null : (
            <Button variant="ghost" size="sm" disabled={finishing || inFlight} onClick={() => setConfirming(true)}>
              Delete
            </Button>
          )}
        </div>
      </div>

      {failed ? (
        <p className="text-sm text-fg-muted">
          We couldn&apos;t read this source. Delete it and try again, or try a different file.
        </p>
      ) : null}

      {unfinished ? (
        <p className="text-sm text-fg-muted">
          This upload didn&apos;t finish. Finish it to process the file, or delete it and upload again.
        </p>
      ) : null}

      {confirming ? (
        <div role="group" aria-label="Confirm delete" className="flex flex-col gap-3">
          <p className="text-sm text-fg">
            Delete <strong className="break-words font-semibold">{source.title}</strong>? The bot stops using
            it. This can&apos;t be undone.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" loading={pending} disabled={inFlight} onClick={remove}>
              Delete source
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => {
                setConfirming(false);
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className={messageClasses}>
          {error}
        </p>
      ) : null}
    </li>
  );
}
