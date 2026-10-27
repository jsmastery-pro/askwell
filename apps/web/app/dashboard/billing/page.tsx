import { PLAN_LIMITS, type Plan } from "@askwell/shared";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { PlanActions } from "../../../components/billing/PlanActions";
import { PlanComparison } from "../../../components/billing/PlanComparison";
import { UsageSummary } from "../../../components/billing/UsageSummary";
import { PROJECTS_PATH } from "../../../components/dashboard-nav/routes";
import { FONT_DISPLAY } from "../../../components/landing/fonts";
import { formatCount } from "../../../components/project-shell/format";
import { BUTTON_PRIMARY, CARD, FOCUS } from "../../../components/ui/styles";
import { getAccountPlan } from "../../../lib/data/billing";
import { listProjectUsage } from "../../../lib/data/usage";
import { EmptyState } from "../../../components/ui/EmptyState";
import { PageHeader } from "../../../components/ui/PageHeader";

export const dynamic = "force-dynamic";

const PLAN_NAME = { free: "Free", pro: "Pro" } as const;

// "1 project with 100 messages a month and 3 knowledge sources"
function planSummary(plan: Plan) {
  const limits = PLAN_LIMITS[plan];
  const projects = limits.projects === 1 ? "1 project with" : `${limits.projects} projects, each with`;
  return `${projects} ${formatCount(limits.messagesPerMonth)} messages a month and ${limits.knowledgeSourcesPerProject} knowledge sources`;
}

export default async function BillingPage() {
  await auth.protect();
  const [plan, usage] = await Promise.all([getAccountPlan(), listProjectUsage()]);
  const now = new Date().toISOString();

  return (
    <div className="space-y-12">
      <PageHeader title="Billing" description="Your plan covers every project on your account." />

      <section
        aria-labelledby="plan-heading"
        className="flex flex-col gap-8 rounded-xl bg-ink p-6 sm:flex-row sm:items-start sm:justify-between sm:p-8"
      >
        <div>
          <h2 id="plan-heading" className="text-sm text-inverse/70">
            Current plan
          </h2>
          <p
            className={`mt-1 text-4xl font-semibold text-inverse`}
            style={FONT_DISPLAY}
          >
            {PLAN_NAME[plan]}
          </p>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-inverse/85">{planSummary(plan)}.</p>
          {plan === "free" && (
            <p className="mt-1 max-w-md text-sm leading-relaxed text-inverse/70">
              Pro gives you {planSummary("pro")}, and lets you customize the widget.
            </p>
          )}
        </div>
        <PlanActions plan={plan} />
      </section>

      <section aria-labelledby="usage-heading">
        <h2 id="usage-heading" className="text-lg font-semibold text-ink" style={FONT_DISPLAY}>
          Messages this month
        </h2>
        <p className="mt-1 text-sm text-muted">Each project has its own monthly limit. Counts update after every bot reply.</p>
        {usage.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="No projects yet"
              action={
                <Link href={PROJECTS_PATH} className={BUTTON_PRIMARY}>
                  Create a project
                </Link>
              }
            >
              Usage shows here once a project has its widget installed.
            </EmptyState>
          </div>
        ) : (
          <ul className={`mt-4 divide-y divide-line ${CARD}`}>
            {usage.map((project) => (
              <li key={project.id} className="px-5 py-4">
                <UsageSummary
                  used={project.messagesUsed}
                  limit={project.messagesLimit}
                  resetsAt={project.resetsAt}
                  now={now}
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
        )}
      </section>

      <section aria-labelledby="compare-heading">
        <h2 id="compare-heading" className="mb-4 text-lg font-semibold text-ink" style={FONT_DISPLAY}>
          Compare plans
        </h2>
        <PlanComparison plan={plan} />
      </section>
    </div>
  );
}
