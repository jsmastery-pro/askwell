import { PLAN_LIMITS } from "@askwell/shared";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { UsageSummary } from "../../../../components/billing/UsageSummary";
import { BILLING_PATH } from "../../../../components/dashboard-nav/routes";
import { FONT_DISPLAY } from "../../../../components/landing/fonts";
import { DemoBadge } from "../../../../components/project-shell/DemoBadge";
import { formatDateTime } from "../../../../components/project-shell/format";
import { UsageMeter } from "../../../../components/project-shell/UsageMeter";
import { FOCUS } from "../../../../components/projects/styles";
import { listConversations } from "../../../../lib/data/conversations";
import { countKnowledgeFiles, listKnowledgeSources } from "../../../../lib/data/knowledge";
import { getProjectUsage } from "../../../../lib/data/usage";

export const dynamic = "force-dynamic";

const LINK = `text-sm font-medium text-[#161A24] underline decoration-[#CBD2DE] underline-offset-4 hover:decoration-[#161A24] ${FOCUS}`;
const PLAN_NAME = { free: "Free", pro: "Pro" } as const;

export default async function ProjectOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth.protect();
  const { id } = await params;
  const usage = await getProjectUsage(userId, id);
  if (!usage) notFound();

  const [files, sources, conversations] = await Promise.all([
    countKnowledgeFiles(id),
    listKnowledgeSources(id),
    listConversations(id),
  ]);
  const filesLimit = PLAN_LIMITS[usage.plan].knowledgeFilesPerProject;
  const processing = sources.filter((s) => s.status === "processing").length;
  const failed = sources.filter((s) => s.status === "failed").length;
  const base = `/dashboard/projects/${id}`;

  return (
    <div className="space-y-12">
      <section aria-labelledby="usage-heading">
        <h2 id="usage-heading" className="mb-2 text-sm font-medium text-[#70788D]">
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

      <div className="grid gap-12 lg:grid-cols-[1.4fr_1fr]">
        <section aria-labelledby="conversations-heading">
          <div className="flex items-center gap-3">
            <h2 id="conversations-heading" className="text-lg font-semibold text-[#161A24]" style={FONT_DISPLAY}>
              Recent conversations
            </h2>
            <DemoBadge />
          </div>
          {conversations.length === 0 ? (
            <p className="mt-4 text-sm text-[#70788D]">
              No conversations yet. They show up here after a visitor sends a message.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-[#D7DCE6] border-y border-[#D7DCE6]">
              {conversations.slice(0, 3).map((conversation) => (
                <li key={conversation.id}>
                  <Link
                    href={`${base}/conversations/${conversation.id}`}
                    className={`block py-3 hover:bg-white/60 ${FOCUS}`}
                  >
                    <p className="truncate text-sm text-[#161A24]">{conversation.preview}</p>
                    <p className="mt-1 text-xs text-[#70788D]">
                      {conversation.messageCount} {conversation.messageCount === 1 ? "message" : "messages"},{" "}
                      {formatDateTime(conversation.createdAt)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4">
            <Link href={`${base}/conversations`} className={LINK}>
              View all conversations
            </Link>
          </p>
        </section>

        <div className="space-y-10">
          <section aria-labelledby="knowledge-heading">
            <div className="flex items-center gap-3">
              <h2 id="knowledge-heading" className="text-lg font-semibold text-[#161A24]" style={FONT_DISPLAY}>
                Knowledge
              </h2>
              <DemoBadge />
            </div>
            <p className="mt-4 text-sm text-[#161A24]">
              {files} of {filesLimit} files
            </p>
            <div className="mt-2">
              <UsageMeter used={files} limit={filesLimit} label="Knowledge files used" />
            </div>
            {(processing > 0 || failed > 0) && (
              <p className="mt-3 text-sm text-[#70788D]">
                {processing > 0 && `${processing} still processing. `}
                {failed > 0 && `${failed} failed to process.`}
              </p>
            )}
            <p className="mt-4">
              <Link href={`${base}/knowledge`} className={LINK}>
                Manage knowledge
              </Link>
            </p>
          </section>

          <section aria-labelledby="install-heading">
            <h2 id="install-heading" className="text-lg font-semibold text-[#161A24]" style={FONT_DISPLAY}>
              Widget
            </h2>
            <p className="mt-2 text-sm text-[#70788D]">Add one script tag to your site to show the chat button.</p>
            <p className="mt-4">
              <Link href={`${base}/install`} className={LINK}>
                Get the install snippet
              </Link>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
