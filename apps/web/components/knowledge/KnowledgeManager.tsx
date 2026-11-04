"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { KnowledgeSource, Plan } from "@askwell/shared";
import { Button, EmptyState, GlassPanel } from "../ui";
import { messageClasses } from "../projects/fields";
import { AddTextForm } from "./AddTextForm";
import { knowledgeLimitPrompt, sourceCountText } from "./display";
import { finishEffects, finishSources } from "./finish";
import { SourceRow } from "./SourceRow";
import type { FinishOutcome } from "./upload";
import { UploadFileForm } from "./UploadFileForm";

export interface KnowledgeManagerProps {
  projectId: string;
  /** The project's sources, newest first, read on the server (owner client). */
  initialSources: KnowledgeSource[];
  /** The owner's plan, read on the server. */
  plan: Plan;
  /** PLAN_LIMITS[plan].knowledgeSources, from the server. */
  limit: number;
  /** Start with this source's upload in flight (tests). */
  initialInFlightId?: string | null;
}

/** Shown in place of the add forms' purpose at the source limit. */
export function KnowledgeLimitNotice({ plan }: { plan: Plan }) {
  const { message, upgrade } = knowledgeLimitPrompt(plan);
  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-control border border-line-strong bg-glass p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-sm text-fg">{message}</p>
      {upgrade ? (
        <Button href="/dashboard/billing" size="sm" className="self-start sm:self-auto">
          Upgrade to Pro
        </Button>
      ) : null}
    </div>
  );
}

/**
 * The knowledge screen: count, add text, upload a file, and the source list.
 * Each action updates the list from its response, then re-reads it on the
 * server (router.refresh()). Processing sources change on the server: the
 * Refresh button re-reads them (no realtime).
 */
export function KnowledgeManager({
  projectId,
  initialSources,
  plan,
  limit,
  initialInFlightId = null,
}: KnowledgeManagerProps) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [sources, setSources] = useState(initialSources);
  /** Why a row went away after Finish (the row itself is gone, so it can't say). */
  const [notice, setNotice] = useState<string | null>(null);
  /** The source the upload form is still sending (its row must not offer Finish or Delete). */
  const [inFlightId, setInFlightId] = useState<string | null>(initialInFlightId);
  // A server re-read (router.refresh()) passes new initialSources: show them.
  const [serverSources, setServerSources] = useState(initialSources);
  if (initialSources !== serverSources) {
    setServerSources(initialSources);
    setSources(initialSources);
  }

  const atLimit = sources.length >= limit;
  const refresh = () => startRefresh(() => router.refresh());

  function added(source: KnowledgeSource) {
    setNotice(null);
    setSources((current) => [source, ...current.filter((s) => s.id !== source.id)]);
    refresh();
  }

  function finished(row: KnowledgeSource, outcome: FinishOutcome) {
    setSources((current) => finishSources(current, row, outcome));
    const effects = finishEffects(row, outcome);
    setNotice(effects.notice);
    if (effects.refresh) refresh();
  }

  function deleted(id: string) {
    setNotice(null);
    setSources((current) => current.filter((s) => s.id !== id));
    refresh();
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 id="knowledge-heading" className="text-lg font-semibold text-fg">
          Knowledge
        </h2>
        <p className="text-sm text-fg-muted">
          What your bot answers from. Paste text or upload PDF, Markdown or TXT files.
        </p>
      </div>

      {atLimit ? <KnowledgeLimitNotice plan={plan} /> : null}

      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        <GlassPanel>
          <AddTextForm projectId={projectId} disabled={atLimit} onAdded={added} />
        </GlassPanel>
        <GlassPanel>
          <UploadFileForm
            projectId={projectId}
            disabled={atLimit}
            onUploaded={added}
            onChanged={refresh}
            onInFlight={setInFlightId}
          />
        </GlassPanel>
      </div>

      <section aria-labelledby="sources-heading" className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <h3 id="sources-heading" className="text-base font-semibold text-fg">
              Sources
            </h3>
            <p className="text-sm text-fg-muted">{sourceCountText(sources.length, limit)}</p>
          </div>
          <Button variant="secondary" size="sm" loading={refreshing} onClick={refresh}>
            Refresh
          </Button>
        </div>

        {notice ? (
          <p role="alert" className={messageClasses}>
            {notice}
          </p>
        ) : null}

        <GlassPanel padding="none">
          {sources.length === 0 ? (
            <EmptyState
              title="No knowledge yet"
              description="Add a source above. Your bot answers visitors from what you add here."
            />
          ) : (
            <ul aria-label="Knowledge sources" className="flex flex-col divide-y divide-line">
              {sources.map((source) => (
                <SourceRow
                  key={source.id}
                  source={source}
                  onDeleted={deleted}
                  onFinished={finished}
                  inFlight={source.id === inFlightId}
                />
              ))}
            </ul>
          )}
        </GlassPanel>
      </section>
    </div>
  );
}
