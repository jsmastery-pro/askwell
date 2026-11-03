import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
let requestHeaders = new Headers();
vi.mock("next/headers", () => ({ headers: async () => requestHeaders }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  usePathname: () => "/",
}));
const loadProject = vi.fn();
vi.mock("../project", () => ({ loadProject: (id: string) => loadProject(id) }));

const { default: InstallPage } = await import("./page");

const PROJECT = {
  id: "11111111-1111-4111-8111-111111111111",
  owner_id: "user_1",
  name: "Docs bot",
  public_key: "pk_Abc123_xyz-789",
  messages_used: 0,
  period_start: "2026-11-01T00:00:00+00:00",
  created_at: "2026-11-03T12:00:00Z",
};

async function render(id = PROJECT.id): Promise<string> {
  return renderToStaticMarkup(await InstallPage({ params: Promise.resolve({ id }) } as never));
}

beforeEach(() => {
  loadProject.mockReset();
  requestHeaders = new Headers({
    host: "internal",
    "x-forwarded-host": "askwell-git-x-javascriptmastery.vercel.app",
    "x-forwarded-proto": "https",
  });
});

afterEach(() => vi.unstubAllEnvs());

describe("/dashboard/projects/[id]/install", () => {
  it("shows the snippet with the project's key and this request's origin (no NEXT_PUBLIC_APP_URL)", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    loadProject.mockResolvedValue(PROJECT);
    const html = await render();
    expect(loadProject).toHaveBeenCalledWith(PROJECT.id);
    expect(html).toContain(
      "&lt;script src=&quot;https://askwell-git-x-javascriptmastery.vercel.app/widget.js&quot; data-key=&quot;pk_Abc123_xyz-789&quot; async&gt;&lt;/script&gt;",
    );
    expect(html).toContain("pk_Abc123_xyz-789");
    expect(html).toMatch(/<li>Copy the script tag above\.<\/li>/);
    expect(html.match(/<li>/g)).toHaveLength(3);
  });

  it("uses NEXT_PUBLIC_APP_URL when it's set", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://askwell.example.com");
    loadProject.mockResolvedValue(PROJECT);
    expect(await render()).toContain("https://askwell.example.com/widget.js");
  });

  it("is a 404 when the project isn't the caller's (or doesn't exist)", async () => {
    loadProject.mockResolvedValue(null);
    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
