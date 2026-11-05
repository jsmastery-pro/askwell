"use client";

import { APP_NAME, type WidgetSettings } from "@askwell/shared";
import { useEffect, useState, type CSSProperties } from "react";
import { textColorOn } from "./colors";

/** The panel's closed transform for each animation (as the widget's `hiddenTransform`). */
export function hiddenTransform(animation: WidgetSettings["animation"], top: boolean): string {
  if (animation === "slide") return `translateY(${top ? -16 : 16}px)`;
  if (animation === "scale") return "scale(.94)";
  return "none";
}

/** Inline styles for the button and the panel at `config`'s corner. */
export function previewStyles(config: WidgetSettings, open: boolean) {
  const [v, h] = config.position.split("-") as ["top" | "bottom", "left" | "right"];
  const button: CSSProperties = {
    [v]: 16,
    [h]: 16,
    backgroundColor: config.button_color,
    color: textColorOn(config.button_color),
  };
  const panel: CSSProperties = {
    [v]: 72,
    [h]: 16,
    transformOrigin: `${v} ${h}`,
    opacity: open ? 1 : 0,
    visibility: open ? "visible" : "hidden",
    transform: open ? "none" : hiddenTransform(config.animation, v === "top"),
    transition: `opacity .2s cubic-bezier(.2,.7,.2,1), transform .2s cubic-bezier(.2,.7,.2,1), visibility 0s ${open ? "0s" : ".2s"}`,
  };
  return { button, panel };
}

/**
 * The widget on a stand-in page: the button in its corner with its color and
 * label, and the open panel with the header text and badge (project.md §6.8).
 * Looks like the real widget (apps/widget/src/styles.ts, EmbedPanel) without
 * loading it. The panel is always light, like the real one.
 */
export function WidgetPreview({ config }: { config: WidgetSettings }) {
  // A new animation remounts the stage, which starts closed and opens: the
  // chosen animation plays each time it changes.
  return <PreviewStage key={config.animation} config={config} />;
}

function PreviewStage({ config }: { config: WidgetSettings }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setOpen(true), 150);
    return () => clearTimeout(timer);
  }, []);

  const styles = previewStyles(config, open);
  const accent = { backgroundColor: config.button_color, color: textColorOn(config.button_color) };

  return (
    <figure aria-label="Widget preview" className="m-0 flex flex-col gap-2">
      <div
        data-surface="light"
        data-position={config.position}
        className="relative h-[440px] overflow-hidden rounded-control border border-line bg-grey-50"
      >
        {/* A stand-in for the customer's page. */}
        <div aria-hidden="true" className="flex flex-col gap-3 p-6">
          <div className="h-4 w-1/2 rounded bg-grey-200" />
          <div className="h-3 w-5/6 rounded bg-grey-200" />
          <div className="h-3 w-2/3 rounded bg-grey-200" />
        </div>

        <div
          data-testid="preview-panel"
          aria-hidden={!open}
          style={styles.panel}
          className="absolute flex h-[calc(100%-88px)] w-[min(300px,calc(100%-32px))] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_12px_48px_rgba(0,0,0,.25)] motion-reduce:transform-none! motion-reduce:transition-none!"
        >
          <div className="border-b border-grey-200 px-4 py-3">
            <p className="truncate text-sm font-semibold text-grey-950">{config.header_text}</p>
          </div>
          <div className="flex flex-1 flex-col gap-2 p-3">
            <p className="max-w-[85%] self-start rounded-2xl bg-grey-100 px-3 py-2 text-sm text-grey-950">
              Hi! How can I help?
            </p>
          </div>
          <div className="flex flex-col gap-2 border-t border-grey-200 px-3 pt-3 pb-2">
            <div className="flex items-center gap-2">
              <div className="h-10 flex-1 rounded-control border border-grey-300 px-3 text-sm leading-10 text-grey-500">
                Type your message…
              </div>
              <div aria-hidden="true" style={accent} className="size-10 shrink-0 rounded-control" />
            </div>
            {config.show_badge ? (
              <p className="text-center text-[11px] text-grey-500">Powered by {APP_NAME}</p>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          style={styles.button}
          className="absolute inline-flex h-11 max-w-[calc(100%-32px)] items-center overflow-hidden rounded-full px-5 text-[15px] leading-none font-semibold whitespace-nowrap shadow-[0_4px_16px_rgba(0,0,0,.2)] outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
        >
          {config.label}
        </button>
      </div>
      <figcaption className="text-xs text-fg-subtle">Click the button to open and close the panel.</figcaption>
    </figure>
  );
}
