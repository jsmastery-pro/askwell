"use client";

import { PLAN_LIMITS, type KnowledgeSource, type Plan } from "@askwell/shared";
import Link from "next/link";
import { useRef, useState, type DragEvent, type FormEvent } from "react";
import { addFileKnowledge, addTextKnowledge, deleteKnowledgeSource } from "../../lib/data/knowledge-actions";
import { formatDateTime } from "../project-shell/format";
import { UsageMeter } from "../project-shell/UsageMeter";
import { BUTTON_DANGER, BUTTON_PRIMARY, BUTTON_SECONDARY, FOCUS, INPUT } from "../ui/styles";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { ACCEPT, checkFile, checkText } from "./validate";
import { EmptyState } from "../ui/EmptyState";

const TYPE_LABEL: Record<KnowledgeSource["type"], string> = {
  pdf: "PDF",
  md: "Markdown",
  txt: "Text file",
  text: "Pasted text",
};

const isFile = (source: KnowledgeSource) => source.type !== "text";

type Props = { projectId: string; initialSources: KnowledgeSource[]; sourcesLimit: number; plan: Plan };

export function KnowledgeManager({ projectId, initialSources, sourcesLimit, plan }: Props) {
  const [sources, setSources] = useState(initialSources);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [textOpen, setTextOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [textErrors, setTextErrors] = useState<{ title?: string; content?: string }>({});
  const [savingText, setSavingText] = useState(false);
  const [confirming, setConfirming] = useState<KnowledgeSource | null>(null);
  const [announcement, setAnnouncement] = useState("");
  // Per-row failures (retry or delete), shown under the row and announced.
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const fileInput = useRef<HTMLInputElement>(null);

  // Files and pasted text count toward one limit (§5).
  const atLimit = sources.length >= sourcesLimit;

  const setRowError = (id: string, message: string | null) =>
    setRowErrors((current) => {
      const next = { ...current };
      if (message) next[id] = message;
      else delete next[id];
      return next;
    });

  const setBusy = (id: string, busy: boolean) =>
    setBusyIds((current) => {
      const next = new Set(current);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });

  const added = (source: KnowledgeSource) => {
    setSources((current) => [source, ...current]);
    setAnnouncement(`${source.title} added. Processing.`);
  };

  async function upload(file: File) {
    setUploadError(null);
    if (atLimit) return;
    const problem = checkFile(file);
    if (problem) {
      setUploadError(problem);
      return;
    }
    setUploading(true);
    try {
      added((await addFileKnowledge(projectId, file)).source);
    } catch {
      setUploadError("The upload didn't go through. Try again.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file && !atLimit && !uploading) void upload(file);
  }

  async function submitText(event: FormEvent) {
    event.preventDefault();
    const checked = checkText(title, content);
    if (!checked.ok) {
      setTextErrors(checked.errors);
      return;
    }
    setTextErrors({});
    setSavingText(true);
    try {
      added((await addTextKnowledge(projectId, checked.request)).source);
      setTitle("");
      setContent("");
      setTextOpen(false);
    } catch {
      setTextErrors({ content: "The text didn't save. Try again." });
    } finally {
      setSavingText(false);
    }
  }

  async function remove(source: KnowledgeSource) {
    setConfirming(null);
    setBusy(source.id, true);
    setRowError(source.id, null);
    try {
      await deleteKnowledgeSource(source.id);
      setSources((current) => current.filter((s) => s.id !== source.id));
      setAnnouncement(`${source.title} deleted.`);
    } catch {
      setRowError(source.id, "Couldn't delete this. Try again in a moment.");
      setAnnouncement(`${source.title} wasn't deleted. Try again.`);
    } finally {
      setBusy(source.id, false);
    }
  }

  return (
    <div className="space-y-8">
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      <div className="max-w-md">
        <p className="text-sm text-ink">
          {sources.length} of {sourcesLimit} sources
        </p>
        <div className="mt-2">
          <UsageMeter used={sources.length} limit={sourcesLimit} label="Knowledge sources used" />
        </div>
        <p className="mt-2 text-xs text-muted">Uploaded files and pasted text both count as sources.</p>
      </div>

      <section aria-label="Add knowledge" className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div>
          <label
            onDragOver={(event) => {
              event.preventDefault();
              if (!atLimit) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`flex min-h-36 flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus ${
              atLimit
                ? "cursor-not-allowed border-line bg-canvas text-muted"
                : dragging
                  ? "cursor-copy border-ink bg-surface"
                  : "cursor-pointer border-line-strong bg-surface hover:border-muted"
            }`}
          >
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPT}
              disabled={atLimit || uploading}
              aria-describedby="upload-help upload-error"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
              }}
            />
            <span className="font-medium text-ink">
              {uploading ? "Uploading…" : atLimit ? "Source limit reached" : "Upload a file"}
            </span>
            <span id="upload-help" className="mt-1 text-sm text-muted">
              {atLimit ? "Delete a source to add another." : "Drop a file here or choose one. PDF, Markdown or text, up to 4 MB."}
            </span>
          </label>
          {atLimit && plan === "free" && (
            <p className="mt-3 text-sm text-muted">
              The Free plan includes {sourcesLimit} sources per project.{" "}
              <Link href="/dashboard/billing" className={`font-medium text-ink underline underline-offset-4 ${FOCUS}`}>
                Upgrade to Pro
              </Link>{" "}
              for up to {PLAN_LIMITS.pro.knowledgeSourcesPerProject}.
            </p>
          )}
          <p id="upload-error" role="alert" className="mt-3 text-sm text-danger empty:hidden">
            {uploadError}
          </p>
        </div>

        <div className="rounded-xl border border-line bg-surface p-5">
          {textOpen ? (
            <form onSubmit={submitText} noValidate className="space-y-3">
              <div>
                <label htmlFor="knowledge-title" className="block text-sm font-medium text-ink">
                  Title
                </label>
                <input
                  id="knowledge-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={200}
                  aria-invalid={Boolean(textErrors.title)}
                  aria-describedby={textErrors.title ? "knowledge-title-error" : undefined}
                  className={`mt-1 w-full ${INPUT}`}
                  placeholder="Shipping FAQ"
                />
                {textErrors.title && (
                  <p id="knowledge-title-error" className="mt-1 text-sm text-danger">
                    {textErrors.title}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="knowledge-content" className="block text-sm font-medium text-ink">
                  Text
                </label>
                <textarea
                  id="knowledge-content"
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  rows={6}
                  aria-invalid={Boolean(textErrors.content)}
                  aria-describedby={textErrors.content ? "knowledge-content-error" : undefined}
                  className={`mt-1 w-full ${INPUT}`}
                  placeholder="Paste answers your visitors often need."
                />
                {textErrors.content && (
                  <p id="knowledge-content-error" className="mt-1 text-sm text-danger">
                    {textErrors.content}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="submit" disabled={savingText} className={BUTTON_PRIMARY}>
                  {savingText ? "Adding…" : "Add text"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTextOpen(false);
                    setTextErrors({});
                  }}
                  className={BUTTON_SECONDARY}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div>
              <p className="font-medium text-ink">Paste text</p>
              <p className="mt-1 text-sm text-muted">
                For FAQs, policies or anything not in a file. Counts as one source.
              </p>
              <button
                type="button"
                onClick={() => setTextOpen(true)}
                disabled={atLimit}
                className={`mt-4 ${BUTTON_SECONDARY}`}
              >
                Paste text
              </button>
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby="sources-heading">
        <h3 id="sources-heading" className="text-base font-semibold text-ink">
          Sources
        </h3>
        {sources.length === 0 ? (
          <div className="mt-3">
            <EmptyState title="No knowledge yet">
              Your bot answers only from what you add here. Upload your product docs or paste an FAQ, and visitors
              get answers from it.
            </EmptyState>
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {sources.map((source) => {
              const busy = busyIds.has(source.id);
              return (
                <li key={source.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-medium text-ink">{source.title}</p>
                    <p className="mt-1 text-xs text-muted">
                      {TYPE_LABEL[source.type]}, added {formatDateTime(source.createdAt)}
                    </p>
                    {source.status === "failed" && (
                      <p className="mt-2 text-sm text-danger">
                        {isFile(source)
                          ? "We couldn't read this file. Scanned or password-protected files don't work; try a text-based copy."
                          : "We couldn't process this text."}
                      </p>
                    )}
                    {rowErrors[source.id] && (
                      <p role="alert" className="mt-2 text-sm font-medium text-danger">
                        {rowErrors[source.id]}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={source.status} />
                    <button
                      type="button"
                      onClick={() => setConfirming(source)}
                      disabled={busy}
                      aria-label={`Delete ${source.title}`}
                      className={BUTTON_DANGER}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {confirming && (
        <ConfirmDialog
          title={`Delete ${confirming.title}?`}
          body={`The ${isFile(confirming) ? "file" : "text"} and everything learned from it are removed. The bot stops using it right away.`}
          confirmLabel="Delete"
          onCancel={() => setConfirming(null)}
          onConfirm={() => remove(confirming)}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: KnowledgeSource["status"] }) {
  if (status === "processing") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-2.5 py-1 text-xs font-medium text-warning">
        <span className="h-1.5 w-1.5 rounded-full bg-warning motion-safe:animate-pulse" aria-hidden />
        Processing
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-danger-soft px-2.5 py-1 text-xs font-medium text-danger">
        <span className="h-1.5 w-1.5 rounded-full bg-danger" aria-hidden />
        Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-xs font-medium text-success">
      <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
      Ready
    </span>
  );
}
