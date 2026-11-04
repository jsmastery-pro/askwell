import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  usePathname: () => "/dashboard/projects/11111111-1111-4111-8111-111111111111/install",
}));
const getOwnedProject = vi.fn();
vi.mock("../../../../lib/projects/projects", () => ({ getOwnedProject: (id: string) => getOwnedProject(id) }));
const loadOwnPlan = vi.fn(async () => "free");
vi.mock("../../../../lib/accounts/account", () => ({ loadOwnPlan: () => loadOwnPlan() }));
const connection = vi.fn(async () => undefined);
vi.mock("next/server", () => ({ connection: () => connection() }));

const { loadProject, loadProjectUsage } = await import("./project");
const { default: ProjectLayout } = await import("./layout");

const ID = "11111111-1111-4111-8111-111111111111";
const PROJECT = {
  id: ID,
  owner_id: "user_1",
  name: "Docs bot",
  public_key: "pk_abc",
  messages_used: 0,
  period_start: "2026-11-01T00:00:00+00:00",
  created_at: "2026-11-03T12:00:00Z",
};

beforeEach(() => {
  getOwnedProject.mockReset();
  loadOwnPlan.mockReset().mockResolvedValue("free");
  connection.mockClear();
  vi.useRealTimers();
});

describe("loadProject", () => {
  it("reads the project with getOwnedProject (owner client, RLS)", async () => {
    getOwnedProject.mockResolvedValue(PROJECT);
    expect(await loadProject(ID)).toEqual(PROJECT);
    expect(getOwnedProject).toHaveBeenCalledWith(ID);
  });

  it("returns null for an id that isn't a uuid, without a database call", async () => {
    expect(await loadProject("not-a-uuid")).toBeNull();
    expect(await loadProject("../../etc")).toBeNull();
    expect(getOwnedProject).not.toHaveBeenCalled();
  });
});

describe("/dashboard/projects/[id] layout", () => {
  it("shows the project's name, a link back and the Install tab", async () => {
    getOwnedProject.mockResolvedValue(PROJECT);
    const html = renderToStaticMarkup(
      await ProjectLayout({ children: <p>child</p>, params: Promise.resolve({ id: ID }) } as never),
    );
    expect(html).toMatch(/<h1[^>]*>Docs bot<\/h1>/);
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain(`href="/dashboard/projects/${ID}/install"`);
    expect(html).toContain("<p>child</p>");
  });

  it("is a 404 for another owner's project (getOwnedProject → null), never a 403", async () => {
    getOwnedProject.mockResolvedValue(null);
    await expect(
      ProjectLayout({ children: null, params: Promise.resolve({ id: ID }) } as never),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("loadProjectUsage (the header meter)", () => {
  // The period started 2026-11-01; its month ends 2026-12-01T00:00:00Z.
  const inPeriod = new Date("2026-11-20T12:00:00Z");

  it("waits for the request, then counts this month against the plan read on the server", async () => {
    vi.useFakeTimers({ now: inPeriod, toFake: ["Date"] });
    getOwnedProject.mockResolvedValue({ ...PROJECT, messages_used: 12 });
    expect(await loadProjectUsage(ID)).toEqual({
      used: 12,
      limit: 100,
      resetsAt: "2026-12-01T00:00:00.000Z",
      atLimit: false,
    });
    expect(connection).toHaveBeenCalledOnce();
    expect(loadOwnPlan).toHaveBeenCalledOnce();
  });

  it("a Pro owner's limit is 2,000", async () => {
    vi.useFakeTimers({ now: inPeriod, toFake: ["Date"] });
    loadOwnPlan.mockResolvedValue("pro");
    getOwnedProject.mockResolvedValue({ ...PROJECT, messages_used: 12 });
    expect((await loadProjectUsage(ID))?.limit).toBe(2000);
  });

  it("a period over a month old shows 0 used", async () => {
    vi.useFakeTimers({ now: new Date("2027-01-15T00:00:00Z"), toFake: ["Date"] });
    getOwnedProject.mockResolvedValue({ ...PROJECT, messages_used: 87 });
    expect(await loadProjectUsage(ID)).toMatchObject({ used: 0, resetsAt: null });
  });

  it("null when the project isn't the caller's", async () => {
    getOwnedProject.mockResolvedValue(null);
    expect(await loadProjectUsage(ID)).toBeNull();
  });
});
