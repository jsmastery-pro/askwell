"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import type { KnowledgeSource } from "@askwell/shared";
import { Button } from "../ui";
import { cx } from "../ui/cx";
import { inputClasses, messageClasses } from "../projects/fields";
import { addErrorText, UPLOAD_STEP_LABELS } from "./display";
import { checkFile, FILE_ACCEPT, FILE_RULES_TEXT } from "./files";
import { uploadKnowledgeFile, type UploadStep } from "./upload";

export interface UploadFileFormProps {
  projectId: string;
  /** At the source limit: the form is shown but can't be used. */
  disabled: boolean;
  /** A file was finalized (Processing or Ready). */
  onUploaded: (source: KnowledgeSource) => void;
  /** Something changed on the server even though the upload failed (e.g. finalize refused the file). */
  onChanged: () => void;
}

/** Pick a PDF/MD/TXT file → upload-url → Storage → finalize. The file never passes through our routes. */
export function UploadFileForm({ projectId, disabled, onUploaded, onChanged }: UploadFileFormProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<UploadStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = step !== null;

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
    const result = await uploadKnowledgeFile(projectId, file, setStep);
    setStep(null);
    if (result.ok) {
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      onUploaded(result.source);
    } else {
      setError(addErrorText(result.error, "file"));
      if (result.step === "finalize") onChanged();
    }
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
      <Button type="submit" loading={pending} disabled={disabled || !file} className="self-start">
        {step ? UPLOAD_STEP_LABELS[step] : "Upload"}
      </Button>
      {error ? (
        <p role="alert" className={messageClasses}>
          {error}
        </p>
      ) : null}
    </form>
  );
}
