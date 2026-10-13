"use client";

import type {
  ApiError,
  CreateProjectResponse,
  Plan,
  Project,
  UpdateProjectResponse,
} from "@askwell/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { BILLING_PATH } from "../dashboard-nav/routes";
import { FONT_MONO } from "../landing/fonts";
import { formatCount } from "../project-shell/format";
import { UsageMeter } from "../project-shell/UsageMeter";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { EmptyState } from "../ui/EmptyState";
import { BUTTON_DANGER, BUTTON_PRIMARY, BUTTON_SECONDARY, CARD, FOCUS, INPUT } from "../ui/styles";

type Props = {
  initialProjects: Project[];
  plan: Plan;
  /** Projects the plan allows. */
  limit: number;
  /** Messages each project gets per month on this plan. */
  messagesLimit: number;
};

async function send<T>(url: string, method: string, body?: unknown): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data: unknown = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: data as T };
    return { ok: false, message: (data as ApiError | null)?.error?.message ?? "Something went wrong. Try again." };
  } catch {
    return { ok: false, message: "Network error. Check your connection and try again." };
  }
}

export function ProjectsManager({ initialProjects, plan, limit, messagesLimit }: Props) {
  const router = useRouter();
  const [projects, setProjects] = useState(initialProjects);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Set synchronously, unlike `busy`, so a second submit in the same tick is ignored.
  const inFlight = useRef(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [confirming, setConfirming] = useState<Project | null>(null);

  async function run<T>(request: () => Promise<T>): Promise<T | undefined> {
    if (inFlight.current) return undefined;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      return await request();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const atLimit = projects.length >= limit;

  async function create(event: FormEvent) {
    event.preventDefault();
    const result = await run(() => send<CreateProjectResponse>("/api/projects", "POST", { name }));
    if (!result) return;
    if (!result.ok) return setError(result.message);
    setProjects((current) => [...current, result.data.project]);
    setName("");
    router.refresh();
  }

  async function rename(event: FormEvent, id: string) {
    event.preventDefault();
    const result = await run(() => send<UpdateProjectResponse>(`/api/projects/${id}`, "PATCH", { name: editName }));
    if (!result) return;
    if (!result.ok) return setError(result.message);
    setProjects((current) => current.map((p) => (p.id === id ? result.data.project : p)));
    setEditingId(null);
    router.refresh();
  }

  async function remove(project: Project) {
    setConfirming(null);
    const result = await run(() => send<{ ok: true }>(`/api/projects/${project.id}`, "DELETE"));
    if (!result) return;
    if (!result.ok) return setError(result.message);
    setProjects((current) => current.filter((p) => p.id !== project.id));
    router.refresh();
  }

  return (
    <div>
      <form onSubmit={create} className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor="new-project" className="sr-only">
          Project name
        </label>
        <input
          id="new-project"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Project name, e.g. Help center"
          maxLength={60}
          required
          className={`flex-1 ${INPUT}`}
        />
        <button type="submit" disabled={busy || !name.trim()} className={BUTTON_PRIMARY}>
          Create project
        </button>
      </form>
      <p className="mt-2 text-sm text-[#70788D]">
        {projects.length} of {limit} project{limit === 1 ? "" : "s"} used
        {atLimit && plan === "free" && (
          <>
            .{" "}
            <Link href={BILLING_PATH} className={`font-medium text-[#161A24] underline underline-offset-4 ${FOCUS}`}>
              Upgrade to Pro
            </Link>{" "}
            for more projects and messages.
          </>
        )}
      </p>

      {error && (
        <p role="alert" className="mt-4 rounded-md border border-[#FDA29B] bg-[#FEF3F2] px-4 py-3 text-sm text-[#B42318]">
          {error}
        </p>
      )}

      {projects.length === 0 ? (
        <div className="mt-8">
          <EmptyState title="No projects yet">
            Name your first project above to get a chat widget and its install snippet.
          </EmptyState>
        </div>
      ) : (
        <ul className={`mt-8 divide-y divide-[#E3E7EE] ${CARD}`}>
          {projects.map((project) => (
            <li key={project.id} className="flex flex-col gap-4 px-5 py-4 md:flex-row md:items-center md:gap-6">
              {editingId === project.id ? (
                <form onSubmit={(e) => rename(e, project.id)} className="flex flex-1 flex-col gap-2 sm:flex-row">
                  <label htmlFor={`rename-${project.id}`} className="sr-only">
                    New name
                  </label>
                  <input
                    id={`rename-${project.id}`}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    maxLength={60}
                    required
                    autoFocus
                    className={`flex-1 ${INPUT}`}
                  />
                  <button type="submit" disabled={busy || !editName.trim()} className={BUTTON_SECONDARY}>
                    Save
                  </button>
                  <button type="button" onClick={() => setEditingId(null)} className={BUTTON_SECONDARY}>
                    Cancel
                  </button>
                </form>
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/dashboard/projects/${project.id}`}
                      className={`block truncate rounded-sm font-medium text-[#161A24] underline-offset-4 hover:underline ${FOCUS}`}
                    >
                      {project.name}
                    </Link>
                    <p className="mt-0.5 truncate text-xs text-[#70788D]" style={FONT_MONO}>
                      {project.publicKey}
                    </p>
                  </div>
                  <div className="md:w-56">
                    <UsageMeter
                      used={project.messagesUsed}
                      limit={messagesLimit}
                      label={`${project.name}: messages used this month`}
                    />
                    <p className="mt-1.5 text-xs text-[#70788D] tabular-nums">
                      {formatCount(project.messagesUsed)} of {formatCount(messagesLimit)} messages this month
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(project.id);
                        setEditName(project.name);
                      }}
                      className={BUTTON_SECONDARY}
                    >
                      Rename
                    </button>
                    <button type="button" onClick={() => setConfirming(project)} disabled={busy} className={BUTTON_DANGER}>
                      Delete
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {confirming && (
        <ConfirmDialog
          title={`Delete ${confirming.name}?`}
          body="Its widget stops working, and its knowledge and conversations are deleted. This can't be undone."
          confirmLabel="Delete project"
          onCancel={() => setConfirming(null)}
          onConfirm={() => remove(confirming)}
        />
      )}
    </div>
  );
}
