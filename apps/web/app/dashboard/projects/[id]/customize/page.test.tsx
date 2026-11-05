import { createClient } from "@supabase/supabase-js";
import type { Database } from "@askwell/db";
import { DEFAULT_WIDGET_CONFIG } from "@askwell/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next/server", () => ({ connection: async () => {} }));
const loadProject = vi.fn();
vi.mock("../project", () => ({ loadProject: (id: string) => loadProject(id) }));
const loadOwnPlan = vi.fn();
vi.mock("../../../../../lib/accounts/account", () => ({ loadOwnPlan: () => loadOwnPlan() }));

// The owner client, recording the PostgREST request loadWidgetConfig() sends.
const requests: { url: URL; apikey: string | null }[] = [];
let rows: unknown = [];
let status = 200;
vi.mock("../../../../../lib/supabase/owner", () => ({
  createOwnerClient: async () =>
    createClient<Database>("https://example.supabase.co", "owner-key", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
          requests.push({ url: new URL(String(input)), apikey: new Headers(init?.headers).get("apikey") });
          return Response.json(rows, { status });
        },
      },
    }),
}));

const { CustomizeSection } = await import("./CustomizeSection");
const { loadWidgetConfig, parseConfig } = await import("./config");

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const ROW = { ...DEFAULT_WIDGET_CONFIG, button_color: "#e11d48", label: "Questions?" };

beforeEach(() => {
  requests.length = 0;
  rows = [ROW];
  status = 200;
  loadProject.mockReset().mockResolvedValue({ id: PROJECT_ID, name: "Bot" });
  loadOwnPlan.mockReset().mockResolvedValue("pro");
});

describe("loadWidgetConfig", () => {
  it("reads the project's row with the owner client (RLS), by project_id", async () => {
    expect(await loadWidgetConfig(PROJECT_ID)).toEqual(ROW);
    const [req] = requests;
    expect(req?.url.pathname).toBe("/rest/v1/widget_configs");
    expect(req?.url.searchParams.get("project_id")).toBe(`eq.${PROJECT_ID}`);
    expect(req?.apikey).toBe("owner-key");
  });

  it("falls back to the defaults when the row is missing", async () => {
    rows = [];
    expect(await loadWidgetConfig(PROJECT_ID)).toEqual(DEFAULT_WIDGET_CONFIG);
  });

  it("throws when the read fails, so the dashboard error page shows", async () => {
    status = 500;
    rows = { code: "XX000", message: "boom" };
    await expect(loadWidgetConfig(PROJECT_ID)).rejects.toThrow("Couldn't read the widget config.");
  });

  it("rejects a stored value outside the shared enums", () => {
    expect(() => parseConfig({ ...ROW, position: "middle" })).toThrow();
  });
});

describe("CustomizeSection", () => {
  it("not the caller's project → 404, nothing else read", async () => {
    loadProject.mockResolvedValue(null);
    await expect(CustomizeSection({ projectId: PROJECT_ID })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(requests).toEqual([]);
    expect(loadOwnPlan).not.toHaveBeenCalled();
  });

  it("Pro: the editable form with the stored values", async () => {
    const html = renderToStaticMarkup(await CustomizeSection({ projectId: PROJECT_ID }));
    expect(html).toContain('value="Questions?"');
    expect(html).not.toContain("Upgrade to Pro");
  });

  it("Free: the locked form with the upgrade prompt (plan read on the server)", async () => {
    loadOwnPlan.mockResolvedValue("free");
    const html = renderToStaticMarkup(await CustomizeSection({ projectId: PROJECT_ID }));
    expect(html).toContain("Upgrade to Pro");
    expect(html).toMatch(/<fieldset[^>]*disabled=""/);
  });
});
