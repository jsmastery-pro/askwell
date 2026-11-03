import { afterEach, describe, expect, it, vi } from "vitest";
import { createProject, deleteProject, renameProject } from "./api";

const calls: { url: string; init?: RequestInit }[] = [];

function respondWith(response: Response | Error) {
  calls.length = 0;
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (response instanceof Error) throw response;
    return response;
  });
}

const project = {
  id: "p1",
  owner_id: "user_1",
  name: "Docs bot",
  public_key: "pk_abc",
  messages_used: 0,
  period_start: "2026-11-01T00:00:00+00:00",
  created_at: "2026-11-03T12:00:00Z",
};

afterEach(() => vi.unstubAllGlobals());

describe("projects API client", () => {
  it("createProject POSTs { name } as JSON and returns the project", async () => {
    respondWith(Response.json({ project }, { status: 201 }));
    expect(await createProject("Docs bot")).toEqual({ ok: true, data: project });
    expect(calls[0]?.url).toBe("/api/projects");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(calls[0]?.init?.body).toBe(JSON.stringify({ name: "Docs bot" }));
    expect(new Headers(calls[0]?.init?.headers).get("content-type")).toBe("application/json");
  });

  it("returns the §8 error from a 403 plan_limit_reached", async () => {
    respondWith(
      Response.json({ error: { code: "plan_limit_reached", message: "Your Free plan allows 1 project." } }, { status: 403 }),
    );
    expect(await createProject("Second")).toEqual({
      ok: false,
      error: { code: "plan_limit_reached", message: "Your Free plan allows 1 project." },
    });
  });

  it("renameProject PATCHes /api/projects/:id", async () => {
    respondWith(Response.json({ project: { ...project, name: "Renamed" } }));
    const result = await renameProject("p1", "Renamed");
    expect(result).toEqual({ ok: true, data: { ...project, name: "Renamed" } });
    expect(calls[0]?.url).toBe("/api/projects/p1");
    expect(calls[0]?.init?.method).toBe("PATCH");
  });

  it("deleteProject DELETEs /api/projects/:id and returns the id", async () => {
    respondWith(Response.json({ id: "p1" }));
    expect(await deleteProject("p1")).toEqual({ ok: true, data: "p1" });
    expect(calls[0]?.init?.method).toBe("DELETE");
  });

  it("returns the 404 not_found error for another owner's project", async () => {
    respondWith(Response.json({ error: { code: "not_found", message: "Project not found." } }, { status: 404 }));
    expect(await deleteProject("p2")).toEqual({
      ok: false,
      error: { code: "not_found", message: "Project not found." },
    });
  });

  it("encodes the id in the URL", async () => {
    respondWith(Response.json({ id: "x" }));
    await deleteProject("a/b?c");
    expect(calls[0]?.url).toBe("/api/projects/a%2Fb%3Fc");
  });

  it("turns a non-JSON error response into an internal error", async () => {
    respondWith(new Response("<html>Bad gateway</html>", { status: 502 }));
    expect(await createProject("Docs bot")).toEqual({
      ok: false,
      error: { code: "internal", message: "Something went wrong. Try again." },
    });
  });

  it("turns a network failure into an internal error", async () => {
    respondWith(new TypeError("Failed to fetch"));
    const result = await renameProject("p1", "Renamed");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("internal");
  });
});
