"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import type { KnowledgeSource } from "@askwell/shared";
import { Button } from "../ui";
import { cx } from "../ui/cx";
import { inputClasses, messageClasses } from "../projects/fields";
import { UPLOAD_STEP_LABELS, uploadFailureView } from "./display";
import { checkFile, FILE_ACCEPT, FILE_RULES_TEXT } from "./files";
import { finalizeKnowledgeFile, uploadKnowledgeFile, type UploadResult, type UploadStep } from "./upload";

export interface UploadFileFormProps {
  projectId: string;
  /** At the source limit: the form is shown but can't be used. */
  disabled: boolean;
  /** A file was finalized (Processing or Ready). */
  onUploaded: (source: KnowledgeSource) => void;
  /** Something changed on the server even though the upload failed: re-read the list. */
  onChanged: () => void;
  /** The source this form is uploading or finalizing right now, or null once its flow ends. */
  onInFlight: (sourceId: string | null) => void;
  /** Start with a failed finalize to retry (tests). */
  initialRetrySourceId?: string;
}

/** Pick a PDF/MD/TXT file → upload-url → Storage → finalize. The file never passes through our routes. */
export function UploadFileForm({
  projectId,
  disabled,
  onUploaded,
  onChanged,
  onInFlight,
  initialRetrySourceId,
}: UploadFileFormProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<UploadStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** A source whose finalize failed with a server or network error. */
  const [retrySourceId, setRetrySourceId] = useState<string | null>(initialRetrySourceId ?? null);
  const pending = step !== null;

  function clearFile() {
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function settle(result: UploadResult) {
    setStep(null);
    onInFlight(null);
    if (result.ok) {
      clearFile();
      setRetrySourceId(null);
      onUploaded(result.source);
      return;
    }
    const view = uploadFailureView(result);
    setError(view.text);
    setRetrySourceId(view.retrySourceId);
    // The file is already in Storage when finalize fails: retry, don't re-upload.
    if (result.step === "finalize") clearFile();
    if (view.refresh) onChanged();
  }

  function choose(chosen: File | null) {
    setError(null);
    setFile(chosen);
    if (!chosen) return;
    const check = checkFile(chosen);
    if (!check.ok) {
      setError(check.message);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || disabled) return;
    setError(null);
    setRetrySourceId(null);
    settle(await uploadKnowledgeFile(projectId, file, setStep, undefined, onInFlight));
  }

  async function retry() {
    if (!retrySourceId) return;
    setError(null);
    onInFlight(retrySourceId);
    settle(await finalizeKnowledgeFile(projectId, retrySourceId, setStep));
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate aria-label="Upload a file">
      <h3 className="text-sm font-semibold text-fg">Upload a file</h3>
      <div className="flex flex-col gap-1">
        <label htmlFor={inputId} className="text-sm text-fg-muted">
          File
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={FILE_ACCEPT}
          className={cx(
            inputClasses,
            "h-auto py-2 file:mr-3 file:rounded-control file:border-0 file:bg-hover file:px-3 file:py-1 file:text-sm file:text-fg",
          )}
          disabled={disabled || pending}
          onChange={(event) => choose(event.target.files?.[0] ?? null)}
        />
        <p className="text-xs text-fg-subtle">{FILE_RULES_TEXT}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={pending} disabled={disabled || !file}>
          {step ? UPLOAD_STEP_LABELS[step] : "Upload"}
        </Button>
        {/* Retrying finishes an existing source, so it stays available at the limit. */}
        {retrySourceId && !pending ? (
          <Button variant="secondary" onClick={retry}>
            Retry
          </Button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className={messageClasses}>
          {error}
        </p>
      ) : null}
    </form>
  );
}
