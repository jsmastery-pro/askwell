"use client";

import { captureClientEvent } from "../../lib/analytics/events";
import { CopyButton } from "../landing/CopyButton";
import { GlassPanel } from "../ui";

/** The install script tag in a code block, with a copy button. */
export function InstallSnippet({ projectId, snippet }: { projectId: string; snippet: string }) {
  return (
    <GlassPanel padding="none" className="min-w-0 overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2">
        <span className="text-sm font-medium text-fg">Script tag</span>
        <CopyButton
          text={snippet}
          onCopied={() => captureClientEvent("snippet_copied", { project_id: projectId })}
        />
      </div>
      <pre className="overflow-x-auto p-4 text-sm leading-relaxed text-fg">
        <code className="whitespace-pre-wrap break-all font-mono">{snippet}</code>
      </pre>
    </GlassPanel>
  );
}
