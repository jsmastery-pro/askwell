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

const { loadProject } = await import("./project");
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

beforeEach(() => getOwnedProject.mockReset());

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
