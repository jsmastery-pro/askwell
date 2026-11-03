"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "../ui";

type CopyState = "idle" | "copied" | "failed";

const labels: Record<CopyState, string> = {
  idle: "Copy",
  copied: "Copied",
  failed: "Copy failed",
};

/** Copies `text` to the clipboard and says so for two seconds. */
export function CopyButton({ text }: { text: string }) {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2000);
  }

  return (
    <Button variant="secondary" size="sm" onClick={copy}>
      <span aria-live="polite">{labels[state]}</span>
    </Button>
  );
}
