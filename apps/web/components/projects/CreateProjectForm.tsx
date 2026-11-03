"use client";

import { useId, useState, type FormEvent } from "react";
import { PROJECT_NAME_MAX_LENGTH, type Plan, type Project } from "@askwell/shared";
import { Button } from "../ui";
import { createProject, type ApiFailure } from "./api";
import { inputClasses, messageClasses } from "./fields";
import { PlanLimitNotice } from "./PlanLimitNotice";

export type CreateErrorView = { kind: "limit" } | { kind: "message"; text: string };

/** How to show a failed create. Switches on the §8 error code, never the HTTP status. */
export function createErrorView(error: ApiFailure): CreateErrorView {
  switch (error.code) {
    case "plan_limit_reached":
      return { kind: "limit" };
    case "unauthorized":
      return { kind: "message", text: "Your session ended. Sign in again to create a project." };
    case "validation_failed":
      return { kind: "message", text: `Use a name of 1 to ${PROJECT_NAME_MAX_LENGTH} characters.` };
    default:
      return { kind: "message", text: "Couldn't create the project. Try again." };
  }
}

export interface CreateProjectFormProps {
  plan: Plan;
  onCreated: (project: Project) => void;
  /** Start with this error shown (tests, and server-rendered states). */
  initialError?: ApiFailure;
}

/** Name + Create project. On the plan limit it shows the upgrade prompt inline. */
export function CreateProjectForm({ plan, onCreated, initialError }: CreateProjectFormProps) {
  const inputId = useId();
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiFailure | undefined>(initialError);
  const view = error ? createErrorView(error) : null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setPending(true);
    setError(undefined);
    const result = await createProject(trimmed);
    setPending(false);
    if (result.ok) {
      setName("");
      onCreated(result.data);
    } else {
      setError(result.error);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <label htmlFor={inputId} className="text-sm font-medium text-fg">
        New project
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id={inputId}
          name="name"
          className={inputClasses}
          placeholder="e.g. Docs site"
          autoComplete="off"
          maxLength={PROJECT_NAME_MAX_LENGTH}
          required
          value={name}
          disabled={pending}
          onChange={(event) => setName(event.target.value)}
        />
        <Button type="submit" loading={pending} disabled={!name.trim()} className="sm:shrink-0">
          Create project
        </Button>
      </div>
      {view?.kind === "limit" ? <PlanLimitNotice plan={plan} /> : null}
      {view?.kind === "message" ? (
        <p role="alert" className={messageClasses}>
          {view.text}
        </p>
      ) : null}
    </form>
  );
}
