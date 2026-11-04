import { createClient } from "@supabase/supabase-js";
import type { Database } from "@askwell/db";
import { PLAN_LIMITS } from "@askwell/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ refresh: () => undefined }),
}));
const loadProject = vi.fn();
vi.mock("../project", () => ({ loadProject: (id: string) => loadProject(id) }));
const loadOwnPlan = vi.fn();
vi.mock("../../../../../lib/accounts/account", () => ({ loadOwnPlan: () => loadOwnPlan() }));
// connection(): resolved by default; a test can hold it open, as a
// prerender does, to check that nothing runs before the request arrives.
let connectionGate: Promise<void> = Promise.resolve();
const connection = vi.fn(() => connectionGate);
vi.mock("next/server", () => ({ connection: () => connection() }));

// The owner client, recording the PostgREST request listOwnSources() sends.
const requests: URL[] = [];
let rows: unknown = [];
let status = 200;
vi.mock("../../../../../lib/supabase/owner", () => ({
  createOwnerClient: async () =>
    createClient<Database>("https://example.supabase.co", "owner-key", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        fetch: async (input: RequestInfo | URL) => {
          requests.push(new URL(String(input)));
          return Response.json(rows, { status });
        },
      },
    }),
}));

const { KnowledgeSection } = await import("./KnowledgeSection");
const { listOwnSources, parseSource } = await import("./sources");

const PROJECT = {
  id: "11111111-1111-4111-8111-111111111111",
  owner_id: "user_1",
  name: "Docs bot",
  public_key: "pk_abc",
  messages_used: 0,
  period_start: "2026-11-01T00:00:00+00:00",
  created_at: "2026-11-03T12:00:00Z",
};
const SOURCE = {
  id: "22222222-2222-4222-8222-222222222222",
  project_id: PROJECT.id,
  title: "Refund policy",
  type: "text",
  storage_key: null,
  status: "uploading",
  created_at: "2026-11-04T09:00:00Z",
};

async function render(): Promise<string> {
  return renderToStaticMarkup(await KnowledgeSection({ projectId: PROJECT.id }));
}

/** Lets every pending promise callback run. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  connectionGate = Promise.resolve();
  connection.mockClear();
  requests.length = 0;
  rows = [];
  status = 200;
  loadProject.mockReset();
  loadOwnPlan.mockReset();
});

describe("/dashboard/projects/[id]/knowledge", () => {
  it("lists the project's sources (owner client) with the plan's limit", async () => {
    loadProject.mockResolvedValue(PROJECT);
    loadOwnPlan.mockResolvedValue("free");
    rows = [SOURCE];
    const html = await render();

    expect(loadProject).toHaveBeenCalledWith(PROJECT.id);
    expect(requests).toHaveLength(1);
    const url = requests[0] as URL;
    expect(url.pathname).toBe("/rest/v1/knowledge_sources");
    expect(url.searchParams.get("project_id")).toBe(`eq.${PROJECT.id}`);
    expect(url.searchParams.get("order")).toBe("created_at.desc,id.asc");

    expect(html).toContain("Refund policy");
    expect(html).toContain(">Upload not finished<");
    expect(html).toContain(`1 of ${PLAN_LIMITS.free.knowledgeSources} sources`);
  });

  it("waits for the request (connection()) before any owner read: nothing starts in a prerender", async () => {
    let arrive = () => undefined as void;
    connectionGate = new Promise<void>((resolve) => (arrive = resolve));
    loadProject.mockResolvedValue(PROJECT);
    loadOwnPlan.mockResolvedValue("free");
    const html = render();
    await flush();
    expect(connection).toHaveBeenCalledOnce();
    expect(loadProject).not.toHaveBeenCalled();
    expect(loadOwnPlan).not.toHaveBeenCalled();
    expect(requests).toHaveLength(0);

    arrive();
    expect(await html).toContain("Sources");
    expect(requests).toHaveLength(1);
  });

  it("uses the Pro limit for a Pro owner", async () => {
    loadProject.mockResolvedValue(PROJECT);
    loadOwnPlan.mockResolvedValue("pro");
    expect(await render()).toContain(`0 of ${PLAN_LIMITS.pro.knowledgeSources} sources`);
  });

  it("is a 404 when the project isn't the caller's (or doesn't exist), and reads no sources", async () => {
    loadProject.mockResolvedValue(null);
    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(requests).toHaveLength(0);
  });
});

describe("listOwnSources", () => {
  it("throws when the read fails, so the dashboard error page shows", async () => {
    status = 403;
    rows = { code: "42501", message: "permission denied for table knowledge_sources" };
    await expect(listOwnSources(PROJECT.id)).rejects.toThrow("Couldn't list the knowledge sources.");
  });

  it("parseSource refuses a type or status outside the shared enums", () => {
    expect(parseSource({ ...SOURCE })).toMatchObject({ status: "uploading", type: "text" });
    expect(() => parseSource({ ...SOURCE, status: "done" })).toThrow(/Unknown source type or status/);
    expect(() => parseSource({ ...SOURCE, type: "docx" })).toThrow(/Unknown source type or status/);
  });
});
