import { PLAN_LIMITS } from "@askwell/shared";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { UsageSummary } from "../../../../components/billing/UsageSummary";
import { BILLING_PATH } from "../../../../components/dashboard-nav/routes";
import { FONT_DISPLAY } from "../../../../components/landing/fonts";
import { formatDateTime } from "../../../../components/project-shell/format";
import { UsageMeter } from "../../../../components/project-shell/UsageMeter";
import { FOCUS, TEXT_LINK } from "../../../../components/ui/styles";
import { listConversations } from "../../../../lib/data/conversations";
import { countKnowledgeSources, listKnowledgeSources } from "../../../../lib/data/knowledge";
import { getProjectUsage } from "../../../../lib/data/usage";

export const dynamic = "force-dynamic";

const PLAN_NAME = { free: "Free", pro: "Pro" } as const;

export default async function ProjectOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth.protect();
  const { id } = await params;
  const usage = await getProjectUsage(userId, id);
  if (!usage) notFound();

  const [sourceCount, sources, conversations] = await Promise.all([
    countKnowledgeSources(id),
    listKnowledgeSources(id),
    listConversations(id),
  ]);
  const sourcesLimit = PLAN_LIMITS[usage.plan].knowledgeSourcesPerProject;
  const processing = sources.filter((s) => s.status === "processing").length;
  const failed = sources.filter((s) => s.status === "failed").length;
  const base = `/dashboard/projects/${id}`;

  return (
    <div className="space-y-12">
      <section aria-labelledby="usage-heading">
        <h2 id="usage-heading" className="mb-2 text-sm font-medium text-muted">
          Messages this month, {PLAN_NAME[usage.plan]} plan
        </h2>
        <UsageSummary
          size="large"
          used={usage.messagesUsed}
          limit={usage.messagesLimit}
          resetsAt={usage.resetsAt}
          now={new Date().toISOString()}
          label="Messages used this month"
          upgradeHref={usage.plan === "free" ? BILLING_PATH : undefined}
        />
      </section>

      <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section aria-labelledby="conversations-heading">
          <div className="flex items-center gap-3">
            <h2 id="conversations-heading" className="text-lg font-semibold text-ink" style={FONT_DISPLAY}>
              Recent conversations
            </h2>
          </div>
          {conversations.length === 0 ? (
            <p className="mt-4 text-sm text-muted">
              No conversations yet. They show up here after a visitor sends a message.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-line border-y border-line">
              {conversations.slice(0, 3).map((conversation) => (
                <li key={conversation.id}>
                  <Link
                    href={`${base}/conversations/${conversation.id}`}
                    className={`block py-3 hover:bg-surface/60 ${FOCUS}`}
                  >
                    <p className="truncate text-sm text-ink">{conversation.preview}</p>
                    <p className="mt-1 text-xs text-muted">
                      {conversation.messageCount} {conversation.messageCount === 1 ? "message" : "messages"},{" "}
                      {formatDateTime(conversation.createdAt)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4">
            <Link href={`${base}/conversations`} className={TEXT_LINK}>
              View all conversations
            </Link>
          </p>
        </section>

        <div className="space-y-10">
          <section aria-labelledby="knowledge-heading">
            <div className="flex items-center gap-3">
              <h2 id="knowledge-heading" className="text-lg font-semibold text-ink" style={FONT_DISPLAY}>
                Knowledge
              </h2>
            </div>
            <p className="mt-4 text-sm text-ink">
              {sourceCount} of {sourcesLimit} sources
            </p>
            <div className="mt-2">
              <UsageMeter used={sourceCount} limit={sourcesLimit} label="Knowledge sources used" />
            </div>
            {(processing > 0 || failed > 0) && (
              <p className="mt-3 text-sm text-muted">
                {processing > 0 && `${processing} still processing. `}
                {failed > 0 && `${failed} failed to process.`}
              </p>
            )}
            <p className="mt-4">
              <Link href={`${base}/knowledge`} className={TEXT_LINK}>
                Manage knowledge
              </Link>
            </p>
          </section>

          <section aria-labelledby="install-heading">
            <h2 id="install-heading" className="text-lg font-semibold text-ink" style={FONT_DISPLAY}>
              Widget
            </h2>
            <p className="mt-2 text-sm text-muted">Add one script tag to your site to show the chat button.</p>
            <p className="mt-4">
              <Link href={`${base}/install`} className={TEXT_LINK}>
                Get the install snippet
              </Link>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
