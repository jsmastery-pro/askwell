"use client";

import { useEffect, useRef } from "react";
import { createEmbedBridge } from "./bridge";
import { CloseIcon } from "./icons";

export interface EmbedUnavailableProps {
  /** The host page's origin from the `origin` param; null turns messaging off. */
  hostOrigin: string | null;
}

/**
 * Shown for an invalid or unknown key. Asks the loader to shrink the iframe
 * to fit (askwell:resize) and offers a close button when messaging is on.
 */
export function EmbedUnavailable({ hostOrigin }: EmbedUnavailableProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    const bridge = createEmbedBridge(hostOrigin, window);
    if (!el || !bridge.enabled) return;
    let last = -1;
    const report = () => {
      const height = Math.ceil(el.getBoundingClientRect().height);
      if (height === last) return;
      last = height;
      bridge.send({ type: "askwell:resize", height });
    };
    // The observer also reports once when it starts.
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, [hostOrigin]);

  return (
    <div data-surface="light" className="flex min-w-[320px] flex-col">
      <div
        ref={ref}
        role="status"
        className="flex items-start gap-3 border-b border-line bg-glass-strong px-4 py-4"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-sm font-semibold text-fg">This chat isn&apos;t available</p>
          <p className="text-xs text-fg-muted">Please try again later.</p>
        </div>
        {hostOrigin ? (
          <button
            type="button"
            aria-label="Close chat"
            onClick={() => createEmbedBridge(hostOrigin, window).send({ type: "askwell:close" })}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-control text-fg-muted outline-none hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-focus"
          >
            <CloseIcon className="size-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
