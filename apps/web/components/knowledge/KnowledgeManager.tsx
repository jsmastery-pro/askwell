"use client";

import { PLAN_LIMITS, type KnowledgeSource, type Plan } from "@askwell/shared";
import Link from "next/link";
import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import {
  addFileKnowledge,
  addTextKnowledge,
  deleteKnowledgeSource,
  retryKnowledgeSource,
} from "../../lib/data/knowledge-actions";
import { formatDateTime } from "../project-shell/format";
import { UsageMeter } from "../project-shell/UsageMeter";
import { BUTTON_DANGER, BUTTON_PRIMARY, BUTTON_SECONDARY, FOCUS, INPUT } from "../projects/styles";
import { ConfirmDelete } from "./ConfirmDelete";
import { ACCEPT, checkFile, checkText } from "./validate";

// MOCK: processing finishes on its own here so the status change is visible.
// P3-T02 makes status real; this timer goes away then.
const DEMO_PROCESSING_MS = 2500;

const TYPE_LABEL: Record<KnowledgeSource["type"], string> = {
  pdf: "PDF",
  md: "Markdown",
  txt: "Text file",
  text: "Pasted text",
};

const isFile = (source: KnowledgeSource) => source.type !== "text";

type Props = { projectId: string; initialSources: KnowledgeSource[]; filesLimit: number; plan: Plan };

export function KnowledgeManager({ projectId, initialSources, filesLimit, plan }: Props) {
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
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const files = sources.filter(isFile).length;
  const atLimit = files >= filesLimit;

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

  const finishProcessingLater = (source: KnowledgeSource) => {
    timers.current.push(
      setTimeout(() => {
        setSources((current) => current.map((s) => (s.id === source.id ? { ...s, status: "ready" } : s)));
        setAnnouncement(`${source.title} is ready.`);
      }, DEMO_PROCESSING_MS),
    );
  };

  const added = (source: KnowledgeSource) => {
    setSources((current) => [source, ...current]);
    setAnnouncement(`${source.title} added. Processing.`);
    finishProcessingLater(source);
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

  async function retry(source: KnowledgeSource) {
    setBusy(source.id, true);
    setRowError(source.id, null);
    try {
      const { source: updated } = await retryKnowledgeSource(source);
      setSources((current) => current.map((s) => (s.id === source.id ? updated : s)));
      setAnnouncement(`Processing ${source.title} again.`);
      finishProcessingLater(updated);
    } catch {
      setRowError(source.id, "Couldn't start processing again. Try again in a moment.");
      setAnnouncement(`${source.title} wasn't retried. Try again.`);
    } finally {
      setBusy(source.id, false);
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
        <p className="text-sm text-[#161A24]">
          {files} of {filesLimit} files
        </p>
        <div className="mt-2">
          <UsageMeter used={files} limit={filesLimit} label="Knowledge files used" />
        </div>
        <p className="mt-2 text-xs text-[#70788D]">Pasted text doesn&apos;t count toward the file limit.</p>
      </div>

      <section aria-label="Add knowledge" className="grid gap-4 md:grid-cols-[1.3fr_1fr]">
        <div>
          <label
            onDragOver={(event) => {
              event.preventDefault();
              if (!atLimit) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`flex min-h-36 flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#F2A33C] ${
              atLimit
                ? "cursor-not-allowed border-[#D7DCE6] bg-[#F5F7FA] text-[#70788D]"
                : dragging
                  ? "cursor-copy border-[#161A24] bg-white"
                  : "cursor-pointer border-[#CBD2DE] bg-white hover:border-[#70788D]"
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
            <span className="font-medium text-[#161A24]">
              {uploading ? "Uploading…" : atLimit ? "File limit reached" : "Upload a file"}
            </span>
            <span id="upload-help" className="mt-1 text-sm text-[#70788D]">
              {atLimit ? "Delete a file to add another." : "Drop a file here or choose one. PDF, Markdown or text, up to 10 MB."}
            </span>
          </label>
          {atLimit && plan === "free" && (
            <p className="mt-3 text-sm text-[#70788D]">
              The Free plan includes {filesLimit} files per project.{" "}
              <Link href="/dashboard/billing" className={`font-medium text-[#161A24] underline underline-offset-4 ${FOCUS}`}>
                Upgrade to Pro
              </Link>{" "}
              for up to {PLAN_LIMITS.pro.knowledgeFilesPerProject}.
            </p>
          )}
          <p id="upload-error" role="alert" className="mt-3 text-sm text-[#B42318] empty:hidden">
            {uploadError}
          </p>
        </div>

        <div className="rounded-xl border border-[#D7DCE6] bg-white p-5">
          {textOpen ? (
            <form onSubmit={submitText} noValidate className="space-y-3">
              <div>
                <label htmlFor="knowledge-title" className="block text-sm font-medium text-[#161A24]">
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
                  <p id="knowledge-title-error" className="mt-1 text-sm text-[#B42318]">
                    {textErrors.title}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="knowledge-content" className="block text-sm font-medium text-[#161A24]">
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
                  <p id="knowledge-content-error" className="mt-1 text-sm text-[#B42318]">
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
              <p className="font-medium text-[#161A24]">Paste text</p>
              <p className="mt-1 text-sm text-[#70788D]">
                For FAQs, policies or anything not in a file. Doesn&apos;t count toward the file limit.
              </p>
              <button type="button" onClick={() => setTextOpen(true)} className={`mt-4 ${BUTTON_SECONDARY}`}>
                Paste text
              </button>
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby="sources-heading">
        <h3 id="sources-heading" className="text-base font-semibold text-[#161A24]">
          Sources
        </h3>
        {sources.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-[#CBD2DE] bg-white px-6 py-10 text-center">
            <p className="font-medium text-[#161A24]">No knowledge yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-[#70788D]">
              Your bot answers only from what you add here. Upload your product docs or paste an FAQ, and
              visitors get answers from it.
            </p>
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-[#D7DCE6] border-y border-[#D7DCE6]">
            {sources.map((source) => {
              const busy = busyIds.has(source.id);
              return (
                <li key={source.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-medium text-[#161A24]">{source.title}</p>
                    <p className="mt-1 text-xs text-[#70788D]">
                      {TYPE_LABEL[source.type]}, added {formatDateTime(source.createdAt)}
                    </p>
                    {source.status === "failed" && (
                      <p className="mt-2 text-sm text-[#B42318]">
                        {isFile(source)
                          ? "We couldn't read this file. Scanned or password-protected files don't work; try a text-based copy."
                          : "We couldn't process this text."}
                      </p>
                    )}
                    {rowErrors[source.id] && (
                      <p role="alert" className="mt-2 text-sm font-medium text-[#B42318]">
                        {rowErrors[source.id]}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={source.status} />
                    {source.status === "failed" && (
                      <button type="button" onClick={() => retry(source)} disabled={busy} className={BUTTON_SECONDARY}>
                        Try again
                      </button>
                    )}
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
        <ConfirmDelete
          title={confirming.title}
          isFile={isFile(confirming)}
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
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FFF4E0] px-2.5 py-1 text-xs font-medium text-[#8A5A00]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#F2A33C] motion-safe:animate-pulse" aria-hidden />
        Processing
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FEF3F2] px-2.5 py-1 text-xs font-medium text-[#B42318]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#B42318]" aria-hidden />
        Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ECFDF3] px-2.5 py-1 text-xs font-medium text-[#067647]">
      <span className="h-1.5 w-1.5 rounded-full bg-[#12B76A]" aria-hidden />
      Ready
    </span>
  );
}
