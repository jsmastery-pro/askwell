import {
  APP_NAME,
  PLAN_LIMITS,
  PLAN_PRICES,
  PLANS,
} from "@askwell/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PRICING_ROWS } from "../components/landing";
import Home from "./page";

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

  it("shows the install snippet with a placeholder key", () => {
    expect(text(html)).toContain('data-key="pk_your_key"');
  });

  it("does not load a widget script", () => {
    expect(html).not.toMatch(/<script[^>]*widget/);
  });
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
