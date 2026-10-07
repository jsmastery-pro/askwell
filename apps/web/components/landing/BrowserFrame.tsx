import type { ReactNode } from "react";
import { FONT_MONO } from "./fonts";

export function BrowserFrame({ url, children }: { url: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-[#161B28] shadow-2xl shadow-black/40">
      <div className="flex items-center gap-3 border-b border-white/10 bg-[#1A2032] px-4 py-3">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        </div>
        <div
          className="flex-1 rounded-md bg-white/5 px-3 py-1 text-center text-xs text-[#70788D]"
          style={FONT_MONO}
        >
          {url}
        </div>
      </div>
      <div className="relative bg-[#0D1019] p-6">{children}</div>
    </div>
  );
}
