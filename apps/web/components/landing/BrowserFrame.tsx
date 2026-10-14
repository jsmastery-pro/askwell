import type { ReactNode } from "react";
import { FONT_MONO } from "./fonts";

/** A glass browser window. Its contents sit on a near-solid fill, so text never reads off the blur. */
export function BrowserFrame({ url, children }: { url: string; children: ReactNode }) {
  return (
    <div className="glass overflow-hidden rounded-2xl shadow-[0_30px_80px_-20px_var(--color-glow)]">
      <div className="flex items-center gap-3 border-b border-glass-line px-4 py-3">
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
          <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
          <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
        </div>
        <div className="flex-1 rounded-full bg-surface/60 px-3 py-1 text-center text-xs text-muted" style={FONT_MONO}>
          {url}
        </div>
      </div>
      <div className="relative bg-surface/80 p-5 sm:p-6">{children}</div>
    </div>
  );
}
