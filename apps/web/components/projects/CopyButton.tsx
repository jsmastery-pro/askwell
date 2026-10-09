"use client";

import { useState } from "react";
import { BUTTON_PRIMARY } from "./styles";

export function CopyButton({ text, label = "Copy snippet" }: { text: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 2000);
  }

  return (
    <button type="button" onClick={copy} className={BUTTON_PRIMARY}>
      <span aria-live="polite">
        {state === "copied" ? "Copied" : state === "failed" ? "Copy failed — select and copy" : label}
      </span>
    </button>
  );
}
