import {
  APP_NAME,
  DEFAULT_WIDGET_CONFIG,
  PLAN_LIMITS,
  PLAN_PRICES,
  PLANS,
} from "@askwell/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PRICING_ROWS } from "../components/landing";
import { LandingDemo } from "../components/landing/LiveDemo";
import { landingWidgetKey } from "../components/landing/landing-widget";
import Home from "./page";

// The demo reads LANDING_WIDGET_KEY at request time: connection() and the
// request headers are faked here.
const connection = vi.fn(async () => {});
vi.mock("next/server", () => ({ connection: () => connection() }));
let requestHeaders = new Headers({ host: "askwell-preview.vercel.app", "x-forwarded-proto": "https" });
vi.mock("next/headers", () => ({ headers: async () => requestHeaders }));
// The key's project lookup (the same one the config route uses).
const getPublicWidgetConfig = vi.fn(async (_key: string): Promise<unknown> => DEFAULT_WIDGET_CONFIG);
vi.mock("../lib/widget/config", () => ({ getPublicWidgetConfig: (key: string) => getPublicWidgetConfig(key) }));

const html = renderToStaticMarkup(<Home />);
const text = (fragment: string) =>
  fragment.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

describe("landing page", () => {
  it("renders the 6 sections in order", () => {
    const order = [
      'id="hero"',
      'id="how-it-works"',
      'id="demo"',
      'id="pricing"',
      'id="install"',
      "<footer",
    ].map((marker) => html.indexOf(marker));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("is on the dark surface", () => {
    expect(html).toContain('data-surface="dark"');
  });

  it("has one h1 and an h2 per content section", () => {
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html.match(/<h2[\s>]/g)).toHaveLength(4);
  });

  it("links every Start free CTA to /sign-up", () => {
    const ctas = [...html.matchAll(/<a[^>]*href="([^"]*)"[^>]*>Start free<\/a>/g)];
    expect(ctas.length).toBeGreaterThan(0);
    for (const [, href] of ctas) expect(href).toBe("/sign-up");
  });

  it("shows APP_NAME", () => {
    expect(html).toContain(APP_NAME);
  });

  it("shows the plan names in order, each with its own price", () => {
    const pricing = html.slice(html.indexOf('id="pricing"'), html.indexOf('id="install"'));
    const headers = [...pricing.matchAll(/<th[^>]*scope="col"[^>]*>(.*?)<\/th>/g)].map(([, cell]) => {
      const [, name = "", price = ""] = cell?.match(/^<span[^>]*>(.*?)<\/span><span[^>]*data-price[^>]*>(.*)<\/span>$/) ?? [];
      return { name: text(name), price: text(price) };
    });
    // Written out by hand, not read from PLAN_NAMES / PLAN_PRICES.
    expect(headers).toEqual([
      { name: "Free", price: "$0/month" },
      { name: "Pro", price: "$19/month" },
    ]);
  });

  it("shows each plan's price from PLAN_PRICES", () => {
    for (const plan of PLANS) {
      const cell = html.match(new RegExp(`<span[^>]*data-price="${plan}"[^>]*>(.*?)</span></th>`));
      expect(cell).not.toBeNull();
      expect(text(cell?.[1] ?? "")).toBe(PLAN_PRICES[plan].display);
    }
    expect(PLAN_PRICES.pro.display).toBe("$19/month");
  });

  it("shows every pricing row with its values", () => {
    const pricing = text(html.slice(html.indexOf('id="pricing"'), html.indexOf('id="install"')));
    for (const row of PRICING_ROWS) {
      expect(pricing).toContain(row.label);
      for (const plan of PLANS) expect(pricing).toContain(row.values[plan]);
    }
  });

  it("puts each plan's value under its own header", () => {
    const pricing = html.slice(html.indexOf('id="pricing"'), html.indexOf('id="install"'));
    const headers = [...pricing.matchAll(/data-price="([^"]+)"/g)].map(([, plan]) => plan);
    expect(headers).toEqual([...PLANS]);
    const rows = [...pricing.matchAll(/<tr[^>]*><th[^>]*>(.*?)<\/th>(.*?)<\/tr>/g)];
    for (const row of PRICING_ROWS) {
      const match = rows.find(([, label]) => text(label ?? "") === row.label);
      expect(match).toBeDefined();
      const cells = [...(match?.[2] ?? "").matchAll(/<td[^>]*>(.*?)<\/td>/g)].map(([, cell]) =>
        text(cell ?? ""),
      );
      expect(cells).toEqual(PLANS.map((plan) => row.values[plan]));
    }
  });

  it("shows the install snippet with a placeholder key", () => {
    expect(text(html)).toContain('data-key="pk_your_key"');
  });

  it("shows the static demo and no widget script in the static shell", () => {
    expect(html).toContain('aria-label="Preview of the chat panel"');
    expect(html).not.toMatch(/<script[^>]*widget/);
  });
});

describe("landing demo (LANDING_WIDGET_KEY)", () => {
  const KEY = "pk_LandingKey_0123456789abcdefghijklmn";
  const render = async () => renderToStaticMarkup(await LandingDemo());

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    getPublicWidgetConfig.mockClear();
    connection.mockClear();
    requestHeaders = new Headers({ host: "askwell-preview.vercel.app", "x-forwarded-proto": "https" });
  });

  it("with a key: loads the real widget from the app URL, and points at it", async () => {
    vi.stubEnv("LANDING_WIDGET_KEY", KEY);
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://askwell.example");
    const out = await render();
    const scripts = [...out.matchAll(/<script[^>]*>/g)].map(([tag]) => tag);
    expect(scripts).toEqual([`<script src="https://askwell.example/widget.js" data-key="${KEY}" async="">`]);
    expect(text(out)).toContain("Try it: the button in the corner is the real widget.");
    expect(out).not.toContain("Preview of the chat panel");
    expect(connection).toHaveBeenCalled();
  });

  it.each([
    ["resolves to no project (another environment's, or deleted)", () => getPublicWidgetConfig.mockResolvedValueOnce(null)],
    ["can't be looked up (database down)", () => getPublicWidgetConfig.mockRejectedValueOnce(new Error("db down"))],
  ])("with a key that %s: the static demo, no widget script", async (_label, arrange) => {
    vi.stubEnv("LANDING_WIDGET_KEY", KEY);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    arrange();
    const out = await render();
    expect(getPublicWidgetConfig).toHaveBeenCalledWith(KEY);
    expect(out).toContain('aria-label="Preview of the chat panel"');
    expect(out).not.toMatch(/<script/);
  });

  it("with a key and no NEXT_PUBLIC_APP_URL: uses this request's origin (each preview has its own)", async () => {
    vi.stubEnv("LANDING_WIDGET_KEY", KEY);
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    expect(await render()).toContain(`src="https://askwell-preview.vercel.app/widget.js"`);
  });

  it("is dynamic: waits for connection() before reading the key", async () => {
    vi.stubEnv("LANDING_WIDGET_KEY", KEY);
    let release = () => {};
    connection.mockImplementationOnce(() => new Promise<void>((resolve) => (release = resolve)));
    const pending = LandingDemo();
    vi.stubEnv("LANDING_WIDGET_KEY", "");
    release();
    expect(renderToStaticMarkup(await pending)).not.toMatch(/<script/);
  });

  it.each([
    ["unset", undefined],
    ["empty", ""],
    ["not a public key", "sk_secret"],
  ])("without a key (%s): the static demo, no widget script", async (_label, value) => {
    vi.stubEnv("LANDING_WIDGET_KEY", value);
    const spy = vi.spyOn(console, "warn");
    const out = await render();
    expect(out).toContain('aria-label="Preview of the chat panel"');
    expect(out).not.toMatch(/<script/);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("landingWidgetKey", () => {
  it("reads a valid public key, trimmed", () => {
    expect(landingWidgetKey({ LANDING_WIDGET_KEY: " pk_abc_DEF-1 " })).toBe("pk_abc_DEF-1");
  });

  it.each([undefined, "", "   ", "pk_", "abc", "pk_has space", `pk_${"a".repeat(200)}`])(
    "is null for %j",
    (value) => {
      expect(landingWidgetKey({ LANDING_WIDGET_KEY: value })).toBeNull();
    },
  );
});

describe("pricing rows", () => {
  const row = (label: string) => PRICING_ROWS.find((r) => r.label === label)!.values;
  const count = (n: number) => n.toLocaleString("en-US");

  it("has one row per §5 line", () => {
    expect(PRICING_ROWS.map((r) => r.label)).toEqual([
      "Projects",
      "Messages / month (per project)",
      "Knowledge sources (per project)",
      "Button color",
      "Button position",
      "Button label",
      "Open animation",
      "Header text",
      "“Powered by” badge",
    ]);
  });

  it("reads the numbers from PLAN_LIMITS", () => {
    for (const plan of PLANS) {
      expect(row("Projects")[plan]).toBe(count(PLAN_LIMITS[plan].projects));
      expect(row("Messages / month (per project)")[plan]).toBe(
        count(PLAN_LIMITS[plan].messagesPerMonth),
      );
      expect(row("Knowledge sources (per project)")[plan]).toBe(
        count(PLAN_LIMITS[plan].knowledgeSources),
      );
    }
  });

  it("matches §5 for the feature rows", () => {
    expect(row("Button color")).toEqual({ free: "Default", pro: "Any" });
    expect(row("Button position")).toEqual({ free: "Bottom right", pro: "Any corner" });
    expect(row("Button label")).toEqual({ free: "Default", pro: "Custom" });
    expect(row("Open animation")).toEqual({ free: "Fade", pro: "Fade / slide / scale" });
    expect(row("Header text")).toEqual({ free: "Default", pro: "Custom" });
    expect(row("“Powered by” badge")).toEqual({ free: "Shown", pro: "Hidden" });
  });
});
