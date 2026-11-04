"use client";

import { useId, useState, type FormEvent } from "react";
import { KNOWLEDGE_TITLE_MAX_LENGTH, MAX_PASTED_TEXT_LENGTH, type KnowledgeSource } from "@askwell/shared";
import { Button } from "../ui";
import { cx } from "../ui/cx";
import { inputClasses, messageClasses } from "../projects/fields";
import { createTextSource } from "./api";
import { addErrorText } from "./display";

export interface AddTextFormProps {
  projectId: string;
  /** At the source limit: the form is shown but can't be used. */
  disabled: boolean;
  onAdded: (source: KnowledgeSource) => void;
}

/** Title + pasted text → POST /api/projects/:id/knowledge. */
export function AddTextForm({ projectId, disabled, onAdded }: AddTextFormProps) {
  const titleId = useId();
  const textId = useId();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = title.trim() !== "" && text.trim() !== "";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || disabled) return;
    setPending(true);
    setError(null);
    const result = await createTextSource(projectId, { title: title.trim(), text: text.trim() });
    setPending(false);
    if (result.ok) {
      setTitle("");
      setText("");
      onAdded(result.data);
    } else {
      setError(addErrorText(result.error, "text"));
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate aria-label="Paste text">
      <h3 className="text-sm font-semibold text-fg">Paste text</h3>
      <div className="flex flex-col gap-1">
        <label htmlFor={titleId} className="text-sm text-fg-muted">
          Title
        </label>
        <input
          id={titleId}
          className={inputClasses}
          placeholder="e.g. Refund policy"
          autoComplete="off"
          maxLength={KNOWLEDGE_TITLE_MAX_LENGTH}
          required
          value={title}
          disabled={disabled || pending}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={textId} className="text-sm text-fg-muted">
          Text
        </label>
        <textarea
          id={textId}
          className={cx(inputClasses, "h-40 resize-y py-2")}
          placeholder="Paste the answers your bot should know."
          maxLength={MAX_PASTED_TEXT_LENGTH}
          required
          value={text}
          disabled={disabled || pending}
          onChange={(event) => setText(event.target.value)}
        />
        <p className="text-xs text-fg-subtle">
          {text.length.toLocaleString("en-US")} / {MAX_PASTED_TEXT_LENGTH.toLocaleString("en-US")} characters
        </p>
      </div>
      <Button type="submit" loading={pending} disabled={disabled || !ready} className="self-start">
        Add text
      </Button>
      {error ? (
        <p role="alert" className={messageClasses}>
          {error}
        </p>
      ) : null}
    </form>
  );
}
