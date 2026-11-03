"use client";

import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { PROJECT_NAME_MAX_LENGTH, type Project } from "@askwell/shared";
import { Button, GlassPanel } from "../ui";
import { deleteProject, renameProject, type ApiFailure } from "./api";
import { inputClasses, messageClasses } from "./fields";
import { formatCreatedDate } from "./format";

export type CardMode = "view" | "rename" | "confirm-delete";

/** A failed rename or delete, in words. A project that's gone reads as gone. */
export function cardErrorText(error: ApiFailure, action: "rename" | "delete"): string {
  switch (error.code) {
    case "not_found":
      return "This project no longer exists. Reload the page.";
    case "unauthorized":
      return "Your session ended. Sign in again.";
    case "validation_failed":
      return `Use a name of 1 to ${PROJECT_NAME_MAX_LENGTH} characters.`;
    default:
      return action === "rename" ? "Couldn't rename the project. Try again." : "Couldn't delete the project. Try again.";
  }
}

export interface ProjectCardProps {
  project: Project;
  onRenamed: (project: Project) => void;
  onDeleted: (id: string) => void;
  /** Start in this mode (tests). */
  initialMode?: CardMode;
}

/** One project: name, created date, link to it, inline rename and delete with a confirm step. */
export function ProjectCard({ project, onRenamed, onDeleted, initialMode = "view" }: ProjectCardProps) {
  const inputId = useId();
  const [mode, setMode] = useState<CardMode>(initialMode);
  const [name, setName] = useState(project.name);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const href = `/dashboard/projects/${project.id}`;

  function switchTo(next: CardMode) {
    setMode(next);
    setError(null);
    setName(project.name);
  }

  async function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (trimmed === project.name) return switchTo("view");
    setPending(true);
    const result = await renameProject(project.id, trimmed);
    setPending(false);
    if (result.ok) {
      onRenamed(result.data);
      setMode("view");
      setError(null);
    } else {
      setError(cardErrorText(result.error, "rename"));
    }
  }

  async function remove() {
    setPending(true);
    const result = await deleteProject(project.id);
    setPending(false);
    if (result.ok) onDeleted(result.data);
    else setError(cardErrorText(result.error, "delete"));
  }

  return (
    <GlassPanel as="article" className="flex min-w-0 flex-col gap-4" aria-label={project.name}>
      {mode === "rename" ? (
        <form onSubmit={rename} className="flex flex-col gap-2" noValidate>
          <label htmlFor={inputId} className="text-sm font-medium text-fg">
            Project name
          </label>
          <input
            id={inputId}
            className={inputClasses}
            maxLength={PROJECT_NAME_MAX_LENGTH}
            required
            autoFocus
            value={name}
            disabled={pending}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") switchTo("view");
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" loading={pending} disabled={!name.trim()}>
              Save
            </Button>
            <Button variant="ghost" size="sm" onClick={() => switchTo("view")} disabled={pending}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="min-w-0 break-words text-base font-semibold text-fg">
            <Link
              href={href}
              className="rounded-control outline-none hover:underline focus-visible:ring-2 focus-visible:ring-focus"
            >
              {project.name}
            </Link>
          </h2>
          <p className="text-sm text-fg-muted">
            Created <time dateTime={project.created_at}>{formatCreatedDate(project.created_at)}</time>
          </p>
        </div>
      )}

      {mode === "confirm-delete" ? (
        <div role="group" aria-label="Confirm delete" className="flex flex-col gap-3">
          <p className="text-sm text-fg">
            Delete <strong className="break-words font-semibold">{project.name}</strong>? Its knowledge and
            conversations are deleted too. This can&apos;t be undone.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" loading={pending} onClick={remove}>
              Delete project
            </Button>
            <Button variant="ghost" size="sm" onClick={() => switchTo("view")} disabled={pending}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {mode === "view" ? (
        <div className="flex flex-wrap gap-2">
          <Button href={`${href}/install`} variant="secondary" size="sm">
            Install
          </Button>
          <Button variant="ghost" size="sm" onClick={() => switchTo("rename")}>
            Rename
          </Button>
          <Button variant="ghost" size="sm" onClick={() => switchTo("confirm-delete")}>
            Delete
          </Button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className={messageClasses}>
          {error}
        </p>
      ) : null}
    </GlassPanel>
  );
}
