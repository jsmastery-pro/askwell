import { APP_NAME, DEFAULT_WIDGET_CONFIG, type WidgetSettings } from "@askwell/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CustomizeForm } from "./CustomizeForm";
import { customizeReducer, initialState } from "./form";
import { previewStyles, WidgetPreview } from "./WidgetPreview";

const CUSTOM: WidgetSettings = {
  button_color: "#e11d48",
  position: "top-left",
  label: "Questions?",
  animation: "scale",
  header_text: "We're here",
  show_badge: false,
};

const render = (props: Parameters<typeof CustomizeForm>[0]) => renderToStaticMarkup(<CustomizeForm {...props} />);

describe("CustomizeForm", () => {
  it("Free: the form is visible but locked, with an upgrade prompt linking to Billing", () => {
    const html = render({ projectId: "p1", stored: DEFAULT_WIDGET_CONFIG, plan: "free" });
    expect(html).toMatch(/<fieldset[^>]*disabled=""/);
    expect(html).toContain("Customizing the widget is a Pro feature.");
    expect(html).toMatch(/<a[^>]*href="\/dashboard\/billing"[^>]*>.*Upgrade to Pro/);
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
  });

  it("Pro: editable, no upgrade prompt, current values filled in", () => {
    const html = render({ projectId: "p1", stored: CUSTOM, plan: "pro" });
    expect(html).not.toMatch(/<fieldset[^>]*disabled=""/);
    expect(html).not.toContain("Upgrade to Pro");
    expect(html).toContain('value="#e11d48"');
    expect(html).toContain('value="Questions?"');
    expect(html).toContain('value="We&#x27;re here"');
    const checkedRadio = (value: string) => new RegExp(`<input(?=[^>]*value="${value}")(?=[^>]*checked="")[^>]*>`);
    expect(html).toMatch(checkedRadio("top-left"));
    expect(html).toMatch(checkedRadio("scale"));
    expect(html).not.toMatch(checkedRadio("bottom-right"));
  });

  it("the preview shows the draft as the owner edits it", () => {
    const state = [
      { type: "set", field: "label", value: "Need help?" },
      { type: "set", field: "button_color", value: "#2563eb" },
      { type: "set", field: "position", value: "bottom-left" },
    ].reduce(customizeReducer as never, initialState(DEFAULT_WIDGET_CONFIG, "pro"));
    const html = render({ projectId: "p1", stored: DEFAULT_WIDGET_CONFIG, plan: "pro", initial: state });
    expect(html).toContain(">Need help?</button>");
    expect(html).toContain("background-color:#2563eb");
    expect(html).toContain('data-position="bottom-left"');
  });

  it("after a 402, shows the upgrade prompt and locks the form", () => {
    const state = customizeReducer(initialState(CUSTOM, "pro"), {
      type: "failed",
      error: { code: "payment_required", message: "Pro only." },
    });
    const html = render({ projectId: "p1", stored: CUSTOM, plan: "pro", initial: state });
    expect(html).toContain("Upgrade to Pro");
    expect(html).toMatch(/<fieldset[^>]*disabled=""/);
  });

  it("locks the fields while saving", () => {
    const state = customizeReducer(
      customizeReducer(initialState(CUSTOM, "pro"), { type: "set", field: "label", value: "Hi" }),
      { type: "saving" },
    );
    const html = render({ projectId: "p1", stored: CUSTOM, plan: "pro", initial: state });
    expect(html).toMatch(/<fieldset[^>]*disabled=""/);
    expect(html).toContain("Saving…");
  });

  it("the preview panel honors reduced motion over its inline transition", () => {
    const html = renderToStaticMarkup(<WidgetPreview config={CUSTOM} />);
    expect(html).toContain("motion-reduce:transition-none!");
    expect(html).toContain("motion-reduce:transform-none!");
  });

  it("a failed save shows its message", () => {
    const state = customizeReducer(
      customizeReducer(initialState(CUSTOM, "pro"), { type: "set", field: "label", value: "Hi" }),
      { type: "failed", error: { code: "internal", message: "Something went wrong. Try again." } },
    );
    expect(render({ projectId: "p1", stored: CUSTOM, plan: "pro", initial: state })).toMatch(
      /role="alert"[^>]*>Something went wrong. Try again./,
    );
  });

  it("Free's preview shows what visitors see, not the stored custom values", () => {
    const html = render({ projectId: "p1", stored: CUSTOM, plan: "free" });
    expect(html).toContain(`>${DEFAULT_WIDGET_CONFIG.label}</button>`);
    expect(html).toContain(`Powered by ${APP_NAME}`);
  });
});

describe("WidgetPreview", () => {
  it("shows the label, header text and color; the badge only when on", () => {
    const html = renderToStaticMarkup(<WidgetPreview config={CUSTOM} />);
    expect(html).toContain(">Questions?</button>");
    expect(html).toContain("We&#x27;re here");
    expect(html).toContain("background-color:#e11d48");
    expect(html).not.toContain("Powered by");
    expect(renderToStaticMarkup(<WidgetPreview config={{ ...CUSTOM, show_badge: true }} />)).toContain(
      `Powered by ${APP_NAME}`,
    );
  });

  it("puts the button and panel in the chosen corner, with readable text on the color", () => {
    const top = previewStyles(CUSTOM, true);
    expect(top.button).toMatchObject({ top: 16, left: 16, color: "#fff" });
    expect(top.panel).toMatchObject({ top: 72, left: 16, transformOrigin: "top left", opacity: 1 });
    const bottom = previewStyles({ ...CUSTOM, position: "bottom-right", button_color: "#fde047" }, true);
    expect(bottom.button).toMatchObject({ bottom: 16, right: 16, color: "#000" });
  });

  it("closed, the panel starts from the chosen animation's transform", () => {
    expect(previewStyles({ ...CUSTOM, animation: "scale" }, false).panel.transform).toBe("scale(.94)");
    expect(previewStyles({ ...CUSTOM, animation: "slide", position: "top-left" }, false).panel.transform).toBe("translateY(-16px)");
    expect(previewStyles({ ...CUSTOM, animation: "slide", position: "bottom-left" }, false).panel.transform).toBe("translateY(16px)");
    expect(previewStyles({ ...CUSTOM, animation: "fade" }, false).panel).toMatchObject({ transform: "none", opacity: 0 });
  });
});
