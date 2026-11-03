import { createClient } from "@supabase/supabase-js";
import type { Database } from "@askwell/db";
import { DEFAULT_WIDGET_CONFIG } from "@askwell/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// The real supabase-js client with fetch recorded, so the tests see the exact
// PostgREST request and answer it like PostgREST would.
const requests: { method: string; url: URL; apikey: string | null }[] = [];
let respond: () => Response = () => Response.json([]);
const createServiceClient = vi.fn(() =>
  createClient<Database>("https://example.supabase.co", "service-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push({
          method: init?.method ?? "GET",
          url: new URL(String(input)),
          apikey: new Headers(init?.headers).get("apikey"),
        });
        return respond();
      },
    },
  }),
);
vi.mock("../supabase/service", () => ({ createServiceClient: () => createServiceClient() }));

const { getPublicWidgetConfig, WidgetConfigError } = await import("./config");

const CUSTOM = {
  button_color: "#ff0066",
  position: "top-left",
  label: "Questions?",
  animation: "scale",
  header_text: "We're here",
  show_badge: false,
} as const;

/** The embedded row PostgREST returns for one project. */
function projectRow(plan: string, config: object | null = CUSTOM) {
  return Response.json([{ widget_configs: config, accounts: { plan } }]);
}

beforeEach(() => {
  requests.length = 0;
  respond = () => Response.json([]);
  createServiceClient.mockClear();
});

describe("getPublicWidgetConfig", () => {
  it("reads the project, its config and its owner's plan in one service-client query by public_key", async () => {
    respond = () => projectRow("pro");
    await getPublicWidgetConfig("pk_abc");

    expect(createServiceClient).toHaveBeenCalledOnce();
    expect(requests).toHaveLength(1);
    const [req] = requests;
    expect(req?.method).toBe("GET");
    expect(req?.apikey).toBe("service-key");
    expect(req?.url.pathname).toBe("/rest/v1/projects");
    expect(req?.url.searchParams.get("public_key")).toBe("eq.pk_abc");
    expect(req?.url.searchParams.get("select")).toBe(
      "widget_configs(button_color,position,label,animation,header_text,show_badge),accounts(plan)",
    );
  });

  it("gives Free the defaults and the badge, even when the row has custom values", async () => {
    respond = () => projectRow("free");
    expect(await getPublicWidgetConfig("pk_abc")).toEqual(DEFAULT_WIDGET_CONFIG);
  });

  it("gives Pro the stored values", async () => {
    respond = () => projectRow("pro");
    expect(await getPublicWidgetConfig("pk_abc")).toEqual(CUSTOM);
  });

  it("returns exactly the 6 WidgetSettings fields", async () => {
    respond = () =>
      Response.json([
        { widget_configs: { ...CUSTOM, project_id: "p1" }, accounts: { plan: "pro", clerk_user_id: "u" } },
      ]);
    const config = await getPublicWidgetConfig("pk_abc");
    expect(Object.keys(config ?? {}).sort()).toEqual(Object.keys(DEFAULT_WIDGET_CONFIG).sort());
  });

  it("returns null for an unknown key", async () => {
    respond = () => Response.json([]);
    expect(await getPublicWidgetConfig("pk_unknown")).toBeNull();
  });

  it("falls back to the defaults if the project has no config row", async () => {
    respond = () => projectRow("pro", null);
    expect(await getPublicWidgetConfig("pk_abc")).toEqual(DEFAULT_WIDGET_CONFIG);
  });

  it("throws WidgetConfigError when the database fails", async () => {
    respond = () => Response.json({ message: "boom", code: "XX000" }, { status: 500 });
    await expect(getPublicWidgetConfig("pk_abc")).rejects.toBeInstanceOf(WidgetConfigError);
  });

  it.each([
    ["an unknown plan", projectRow("enterprise")],
    ["an unknown position", projectRow("pro", { ...CUSTOM, position: "middle" })],
    ["an unknown animation", projectRow("pro", { ...CUSTOM, animation: "spin" })],
  ])("throws WidgetConfigError on %s", async (_label, response) => {
    respond = () => response.clone();
    await expect(getPublicWidgetConfig("pk_abc")).rejects.toBeInstanceOf(WidgetConfigError);
  });
});
