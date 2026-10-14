"use client";

import type { WidgetConfig } from "@askwell/shared";
import { useState } from "react";
import { textColorOn } from "../widget-panel/contrast";
import { Panel } from "../widget-panel/Panel";
import { FOCUS } from "../ui/styles";

// Mirrors the loader (apps/widget/src/styles.ts): pill button, 12px gap, panel above a bottom
// button and below a top one, same three open animations.
const CLOSED: Record<WidgetConfig["animation"], string> = {
  fade: "opacity-0",
  slide: "opacity-0",
  scale: "opacity-0 scale-[0.92]",
};

export function WidgetPreview({ config }: { config: WidgetConfig }) {
  const [open, setOpen] = useState(true);
  const [vertical, horizontal] = config.position.split("-") as ["top" | "bottom", "left" | "right"];
  const slide = config.animation === "slide" ? (vertical === "bottom" ? "translate-y-3" : "-translate-y-3") : "";

  return (
    <figure aria-label="Live preview of your widget" className="overflow-hidden rounded-xl border border-line-strong bg-surface shadow-sm">
      <div className="flex items-center gap-2 border-b border-line bg-canvas px-3 py-2">
        <span className="flex gap-1" aria-hidden>
          {[0, 1, 2].map((dot) => (
            <span key={dot} className="h-2 w-2 rounded-full bg-line-strong" />
          ))}
        </span>
        <span className="flex-1 truncate rounded bg-surface px-2 py-0.5 text-center text-xs text-muted">
          yoursite.com
        </span>
      </div>

      <div className="relative h-[620px] overflow-hidden bg-canvas sm:h-[660px]">
        {/* Stand-in page content, so the widget is judged against a real-looking site. */}
        <div className="space-y-3 p-6" aria-hidden>
          <div className="h-5 w-40 rounded bg-line" />
          <div className="h-3 w-full max-w-sm rounded bg-canvas" />
          <div className="h-3 w-full max-w-xs rounded bg-canvas" />
        </div>

        <div
          data-position={config.position}
          className={`absolute flex max-w-[calc(100%-32px)] gap-3 ${vertical === "bottom" ? "bottom-4 flex-col" : "top-4 flex-col-reverse"} ${
            horizontal === "right" ? "right-4 items-end" : "left-4 items-start"
          }`}
        >
          <div
            data-testid="preview-panel"
            data-open={open}
            aria-hidden={!open}
            inert={!open}
            className={`h-[480px] w-[320px] max-w-full overflow-hidden rounded-[14px] bg-surface shadow-[0_12px_40px_rgba(0,0,0,0.25)] transition duration-200 motion-reduce:transition-none sm:h-[520px] [&>div]:h-full! ${
              open ? "opacity-100" : `pointer-events-none ${CLOSED[config.animation]} ${slide}`
            }`}
            style={{ transformOrigin: `${vertical} ${horizontal}` }}
          >
            <Panel config={config} parentOrigin={null} />
          </div>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            className={`inline-flex items-center gap-2 rounded-full px-[18px] py-3 text-sm font-semibold shadow-[0_6px_20px_rgba(0,0,0,0.2)] ${FOCUS}`}
            style={{ background: config.buttonColor, color: textColorOn(config.buttonColor) }}
          >
            {config.label}
          </button>
        </div>
      </div>
      <figcaption className="border-t border-line px-4 py-2 text-xs text-muted">
        Click the button to see the open animation. You can chat in the preview; replies are samples.
      </figcaption>
    </figure>
  );
}
