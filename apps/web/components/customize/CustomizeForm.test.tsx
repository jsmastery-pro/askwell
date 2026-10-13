import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { WIDGET_DEFAULTS, type WidgetConfig } from "@askwell/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { saveWidgetConfig } from "../../lib/data/config-actions";
import { CustomizeForm } from "./CustomizeForm";

vi.mock("../../lib/data/config-actions", () => ({
  saveWidgetConfig: vi.fn(async (_projectId: string, current: WidgetConfig, changes: Partial<WidgetConfig>) => ({
    config: {
      ...current,
      ...Object.fromEntries(
        Object.entries(changes).map(([k, v]) => [k, v === null ? WIDGET_DEFAULTS[k as keyof WidgetConfig] : v]),
      ),
    },
  })),
}));

const PROJECT = "11111111-2222-4333-8444-555555555555";
const proConfig: WidgetConfig = { ...WIDGET_DEFAULTS, buttonColor: "#16a34a", label: "Need help?", showBadge: false };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const renderForm = (plan: "free" | "pro", config: WidgetConfig = plan === "pro" ? proConfig : WIDGET_DEFAULTS) =>
  render(<CustomizeForm projectId={PROJECT} plan={plan} initialConfig={config} />);

const preview = () => screen.getByRole("figure", { name: "Live preview of your widget" });
const isDisabled = (element: Element) => element.matches(":disabled");

describe("CustomizeForm on Free", () => {
  it("shows the form locked with an upgrade prompt, and no Save", () => {
    renderForm("free");

    expect(screen.getByText("Customizing the widget is a Pro feature")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Upgrade to Pro" }).getAttribute("href")).toBe("/dashboard/billing");
    for (const field of [
      screen.getByLabelText("Button color"),
      screen.getByLabelText("Pick a button color"),
      screen.getByLabelText("Button label"),
      screen.getByLabelText("Header text"),
      screen.getByRole("radio", { name: "Top left" }),
      screen.getByRole("radio", { name: "Slide" }),
      screen.getByRole("checkbox", { name: /Powered by/ }),
    ]) {
      expect(isDisabled(field)).toBe(true);
    }
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
    expect(screen.queryByText("Reset to default")).toBeNull();
  });

  it("still previews the default widget, with the badge", () => {
    renderForm("free");
    expect(within(preview()).getByText(WIDGET_DEFAULTS.label)).toBeTruthy();
    expect(within(preview()).getByText(/Powered by/)).toBeTruthy();
  });
});

describe("CustomizeForm on Pro", () => {
  it("shows an error for an invalid color and keeps the preview on the last valid one", () => {
    renderForm("pro");
    const button = within(preview()).getByRole("button", { name: "Need help?" });

    fireEvent.change(screen.getByLabelText("Button color"), { target: { value: "#12" } });

    expect(screen.getByText("Use a 6-digit hex color, like #4f46e5.")).toBeTruthy();
    expect(screen.getByLabelText("Button color").getAttribute("aria-invalid")).toBe("true");
    expect(button.style.background).toBe("rgb(22, 163, 74)");

    fireEvent.change(screen.getByLabelText("Button color"), { target: { value: "#ff0000" } });
    expect(screen.queryByText("Use a 6-digit hex color, like #4f46e5.")).toBeNull();
    expect(button.style.background).toBe("rgb(255, 0, 0)");
  });

  it("updates the preview live as fields change", () => {
    renderForm("pro");

    fireEvent.change(screen.getByLabelText("Header text"), { target: { value: "Talk to Acme" } });
    expect(within(preview()).getByRole("heading", { name: "Talk to Acme" })).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Button label"), { target: { value: "Questions?" } });
    expect(within(preview()).getByRole("button", { name: "Questions?" })).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: "Top left" }));
    expect(preview().querySelector("[data-position]")!.getAttribute("data-position")).toBe("top-left");

    fireEvent.click(screen.getByRole("checkbox", { name: /Powered by/ }));
    expect(within(preview()).getByText(/Powered by/)).toBeTruthy();
  });

  it("saves only the changes, sending null for a reset, then shows Saved", async () => {
    renderForm("pro");
    const save = screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    fireEvent.click(screen.getByRole("radio", { name: "Top right" }));
    const labelField = screen.getByLabelText("Button label").closest("div")!.parentElement!;
    fireEvent.click(within(labelField).getByRole("button", { name: "Reset to default" }));
    expect(save.disabled).toBe(false);

    await act(async () => {
      fireEvent.click(save);
    });

    expect(saveWidgetConfig).toHaveBeenCalledWith(PROJECT, proConfig, { position: "top-right", label: null });
    expect(screen.getByText("Saved")).toBeTruthy();
    expect((screen.getByLabelText("Button label") as HTMLInputElement).value).toBe(WIDGET_DEFAULTS.label);
    expect(save.disabled).toBe(true);
  });

  it("doesn't save an invalid form", async () => {
    renderForm("pro");
    fireEvent.change(screen.getByLabelText("Button label"), { target: { value: "   " } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    });

    expect(saveWidgetConfig).not.toHaveBeenCalled();
    expect(screen.getByText("Add a label of 40 characters or fewer.")).toBeTruthy();
  });

  it("discards unsaved changes", () => {
    renderForm("pro");
    fireEvent.change(screen.getByLabelText("Header text"), { target: { value: "Changed" } });

    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));

    expect((screen.getByLabelText("Header text") as HTMLInputElement).value).toBe(proConfig.headerText);
    expect(screen.queryByRole("button", { name: "Discard changes" })).toBeNull();
  });

  it("opens and closes the preview panel from its button", () => {
    renderForm("pro");
    const panel = screen.getByTestId("preview-panel");
    expect(panel.getAttribute("data-open")).toBe("true");

    fireEvent.click(within(preview()).getByRole("button", { name: "Need help?" }));
    expect(panel.getAttribute("data-open")).toBe("false");
    expect(panel.hasAttribute("inert")).toBe(true);
  });
});
