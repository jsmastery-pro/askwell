import type { Project } from "@askwell/shared";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectsManager } from "./ProjectsManager";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const project = (overrides: Partial<Project> = {}): Project => ({
  id: "11111111-1111-4111-8111-111111111111",
  name: "Help center",
  publicKey: "pk_one",
  messagesUsed: 0,
  periodStart: "2026-10-01T00:00:00.000Z",
  createdAt: "2026-10-01T00:00:00.000Z",
  ...overrides,
});

const fetchMock = vi.fn();
const respond = (status: number, body: unknown) =>
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

async function submitCreate(name: string) {
  fireEvent.change(screen.getByLabelText("Project name"), { target: { value: name } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));
  });
}

describe("ProjectsManager", () => {
  it("creates a project and lists it with a link to its page", async () => {
    render(<ProjectsManager initialProjects={[]} limit={1} />);
    respond(201, { project: project({ name: "Docs bot" }) });
    await submitCreate("Docs bot");

    expect(fetchMock).toHaveBeenCalledWith("/api/projects", expect.objectContaining({ method: "POST", body: '{"name":"Docs bot"}' }));
    expect(screen.getByText("Docs bot")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open" }).getAttribute("href")).toBe(
      `/dashboard/projects/${project().id}`,
    );
    expect(screen.getByText("1 of 1 project used")).toBeTruthy();
  });

  it("shows the plan-limit message when create returns 403", async () => {
    render(<ProjectsManager initialProjects={[project()]} limit={1} />);
    respond(403, { error: { code: "plan_limit", message: "Your plan allows 1 project. Upgrade to add more." } });
    await submitCreate("Second");

    expect(screen.getByRole("alert").textContent).toBe("Your plan allows 1 project. Upgrade to add more.");
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("sends one request when create is submitted twice in the same tick", async () => {
    render(<ProjectsManager initialProjects={[]} limit={5} />);
    fetchMock.mockReturnValue(new Promise(() => {})); // never resolves: the first request stays in flight
    fireEvent.change(screen.getByLabelText("Project name"), { target: { value: "Docs bot" } });
    const form = screen.getByRole("button", { name: "Create project" }).closest("form")!;
    await act(async () => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("renames a project", async () => {
    render(<ProjectsManager initialProjects={[project()]} limit={5} />);
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    fireEvent.change(screen.getByLabelText("New name"), { target: { value: "Support" } });
    respond(200, { project: project({ name: "Support" }) });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });

    expect(fetchMock).toHaveBeenCalledWith(`/api/projects/${project().id}`, expect.objectContaining({ method: "PATCH" }));
    expect(screen.getByText("Support")).toBeTruthy();
  });

  it("deletes a project after confirming", async () => {
    vi.stubGlobal("confirm", () => true);
    render(<ProjectsManager initialProjects={[project()]} limit={5} />);
    respond(200, { ok: true });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    });

    expect(fetchMock).toHaveBeenCalledWith(`/api/projects/${project().id}`, expect.objectContaining({ method: "DELETE" }));
    expect(screen.getByText("No projects yet")).toBeTruthy();
  });

  it("renders project names as text, never HTML", () => {
    const { container } = render(
      <ProjectsManager initialProjects={[project({ name: '<img src=x onerror="alert(1)">' })]} limit={5} />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText('<img src=x onerror="alert(1)">')).toBeTruthy();
  });
});
