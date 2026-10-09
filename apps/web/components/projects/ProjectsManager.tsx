"use client";

import type {
  ApiError,
  CreateProjectResponse,
  Project,
  UpdateProjectResponse,
} from "@askwell/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { BUTTON_DANGER, BUTTON_PRIMARY, BUTTON_SECONDARY, FOCUS, INPUT } from "./styles";

type Props = { initialProjects: Project[]; limit: number };

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

export function ProjectsManager({ initialProjects, limit }: Props) {
  const router = useRouter();
  const [projects, setProjects] = useState(initialProjects);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Set synchronously, unlike `busy`, so a second submit in the same tick is ignored.
  const inFlight = useRef(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

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
    if (!window.confirm(`Delete "${project.name}"? Its widget, knowledge and conversations are deleted too.`)) return;
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
      </p>

      {error && (
        <p role="alert" className="mt-4 rounded-md border border-[#FDA29B] bg-[#FEF3F2] px-4 py-3 text-sm text-[#B42318]">
          {error}
        </p>
      )}

      {projects.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-[#CBD2DE] bg-white px-6 py-12 text-center">
          <p className="font-medium text-[#161A24]">No projects yet</p>
          <p className="mt-1 text-sm text-[#70788D]">Create one to get your widget and install snippet.</p>
        </div>
      ) : (
        <ul className="mt-8 divide-y divide-[#E3E7EE] rounded-xl border border-[#E3E7EE] bg-white">
          {projects.map((project) => (
            <li key={project.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
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
                    <p className="truncate font-medium text-[#161A24]">{project.name}</p>
                    <p className="truncate text-xs text-[#70788D]">{project.publicKey}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/dashboard/projects/${project.id}/install`}
                      className={`rounded-md px-3 py-1.5 text-sm font-medium text-[#161A24] underline-offset-4 hover:underline ${FOCUS}`}
                    >
                      Install
                    </Link>
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
                    <button type="button" onClick={() => remove(project)} disabled={busy} className={BUTTON_DANGER}>
                      Delete
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
