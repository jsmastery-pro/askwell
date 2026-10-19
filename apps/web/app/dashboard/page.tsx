import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { currentUsage } from "../../components/billing/level";
import { UsageSummary } from "../../components/billing/UsageSummary";
import { GettingStarted } from "../../components/dashboard-home/GettingStarted";
import { MessagesChart } from "../../components/dashboard-home/MessagesChart";
import { RangeSwitch } from "../../components/dashboard-home/RangeSwitch";
import { RecentChats } from "../../components/dashboard-home/RecentChats";
import { StatCard } from "../../components/dashboard-home/StatCard";
import { PROJECTS_PATH } from "../../components/dashboard-nav/routes";
import { FONT_DISPLAY } from "../../components/landing/fonts";
import { PageHeader } from "../../components/ui/PageHeader";
import { CARD, FOCUS, GLASS_CARD, TEXT_LINK } from "../../components/ui/styles";
import { getDashboard, parseRange, RANGE_DAYS } from "../../lib/data/analytics";

export const dynamic = "force-dynamic";

const PLAN_NAME = { free: "Free", pro: "Pro" } as const;

function SectionTitle({ id, children }: { id: string; children: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <h2 id={id} className="text-lg font-semibold text-ink" style={FONT_DISPLAY}>
        {children}
      </h2>
    </div>
  );
}

// The home: activity across every project the owner has. Sign-in lands here.
export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ range?: string | string[] }> }) {
  const { userId } = await auth.protect();
  const range = parseRange((await searchParams).range);
  const now = new Date();
  const data = await getDashboard(userId, range, now);

  if (data.projectCount === 0) {
    return (
      <div>
        <PageHeader title="Dashboard" />
        <GettingStarted />
      </div>
    );
  }

  const period = `${RANGE_DAYS[range]} days`;
  const nowIso = now.toISOString();
  const usedNow = (project: (typeof data.usage)[number]) => currentUsage(project.messagesUsed, project.resetsAt, nowIso).used;
  const busiest = [...data.usage].sort((a, b) => usedNow(b) - usedNow(a)).slice(0, 5);
  const noChats = data.current.messages === 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <PageHeader title="Dashboard" description={`Activity across all your projects, last ${period}.`} />
        <RangeSwitch current={range} />
      </div>

      <section aria-label={`Totals, last ${period}`} className="-mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Messages"
          value={data.current.messages}
          change={{ current: data.current.messages, previous: data.previous.messages, period }}
        />
        <StatCard
          label="Conversations"
          value={data.current.conversations}
          change={{ current: data.current.conversations, previous: data.previous.conversations, period }}
        />
        <StatCard
          label="Visitors"
          value={data.current.visitors}
          change={{ current: data.current.visitors, previous: data.previous.visitors, period }}
        />
        <StatCard
          label="Projects"
          value={`${data.projectCount} of ${data.projectLimit}`}
          footer={<span className="text-muted">{PLAN_NAME[data.plan]} plan</span>}
        />
      </section>

      <section aria-labelledby="chart-heading" className={`${GLASS_CARD} p-4 sm:p-6`}>
        <SectionTitle id="chart-heading">
          Messages per day, all projects
        </SectionTitle>
        <div className="mt-5">
          {noChats ? (
            <div className="rounded-lg border border-dashed border-line-strong px-6 py-10 text-center">
              <p className="font-medium text-ink">No chats yet. Install the widget to start.</p>
              <Link href={`/dashboard/projects/${busiest[0]!.id}/install`} className={`mt-3 inline-block ${TEXT_LINK}`}>
                Install the widget on {busiest[0]!.name}
              </Link>
            </div>
          ) : (
            <MessagesChart days={data.daily} />
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <section aria-labelledby="usage-heading" className={`${CARD} p-4 sm:p-6`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionTitle id="usage-heading">Projects: usage this month</SectionTitle>
            <Link href={PROJECTS_PATH} className={TEXT_LINK}>
              Manage projects
            </Link>
          </div>
          <ul className="mt-4 divide-y divide-line">
            {busiest.map((project) => (
              <li key={project.id} className="py-4 first:pt-0 last:pb-0">
                <UsageSummary
                  used={project.messagesUsed}
                  limit={project.messagesLimit}
                  resetsAt={project.resetsAt}
                  now={nowIso}
                  label={`${project.name}: messages used this month`}
                  title={
                    <Link
                      href={`/dashboard/projects/${project.id}`}
                      className={`block truncate rounded-sm font-medium text-ink underline-offset-4 hover:underline ${FOCUS}`}
                    >
                      {project.name}
                    </Link>
                  }
                />
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="recent-heading" className={`${CARD} p-4 sm:p-6`}>
          <SectionTitle id="recent-heading">
            Recent chats
          </SectionTitle>
          <div className="mt-3">
            <RecentChats chats={data.recentChats} now={now} />
          </div>
        </section>
      </div>
    </div>
  );
}
