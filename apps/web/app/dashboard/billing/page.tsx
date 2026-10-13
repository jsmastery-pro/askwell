import { PLAN_LIMITS, type Plan } from "@askwell/shared";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { PlanActions } from "../../../components/billing/PlanActions";
import { PlanComparison } from "../../../components/billing/PlanComparison";
import { UsageSummary } from "../../../components/billing/UsageSummary";
import { DASHBOARD_HOME } from "../../../components/dashboard-nav/routes";
import { FONT_DISPLAY } from "../../../components/landing/fonts";
import { formatCount } from "../../../components/project-shell/format";
import { BUTTON_PRIMARY, FOCUS } from "../../../components/projects/styles";
import { getAccountPlan } from "../../../lib/data/billing";
import { listProjectUsage } from "../../../lib/data/usage";

export const dynamic = "force-dynamic";

const PLAN_NAME = { free: "Free", pro: "Pro" } as const;

// "1 project with 100 messages a month and 3 knowledge files"
function planSummary(plan: Plan) {
  const limits = PLAN_LIMITS[plan];
  const projects = limits.projects === 1 ? "1 project with" : `${limits.projects} projects, each with`;
  return `${projects} ${formatCount(limits.messagesPerMonth)} messages a month and ${limits.knowledgeFilesPerProject} knowledge files`;
}

export default async function BillingPage() {
  const { userId } = await auth.protect();
  const [plan, usage] = await Promise.all([getAccountPlan(userId), listProjectUsage(userId)]);
  const now = new Date().toISOString();

  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-3xl font-semibold text-[#161A24]" style={FONT_DISPLAY}>
          Billing
        </h1>
        <p className="mt-3 max-w-prose text-[#70788D]">Your plan covers every project on your account.</p>
      </div>

      <section
        aria-labelledby="plan-heading"
        className="flex flex-col gap-8 rounded-xl bg-[#10131D] p-6 sm:flex-row sm:items-start sm:justify-between sm:p-8"
      >
        <div>
          <h2 id="plan-heading" className="text-sm text-[#AEB5C4]">
            Current plan
          </h2>
          <p
            className={`mt-1 text-4xl font-semibold ${plan === "pro" ? "text-[#F2A33C]" : "text-white"}`}
            style={FONT_DISPLAY}
          >
            {PLAN_NAME[plan]}
          </p>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-[#DDE2EA]">{planSummary(plan)}.</p>
          {plan === "free" && (
            <p className="mt-1 max-w-md text-sm leading-relaxed text-[#AEB5C4]">
              Pro gives you {planSummary("pro")}, and lets you customize the widget.
            </p>
          )}
        </div>
        <PlanActions plan={plan} />
      </section>

      <section aria-labelledby="usage-heading">
        <h2 id="usage-heading" className="text-lg font-semibold text-[#161A24]" style={FONT_DISPLAY}>
          Messages this month
        </h2>
        <p className="mt-1 text-sm text-[#70788D]">Each project has its own monthly limit. Counts update after every bot reply.</p>
        {usage.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-[#CBD2DE] bg-white px-6 py-10 text-center">
            <p className="font-medium text-[#161A24]">No projects yet</p>
            <p className="mt-1 text-sm text-[#70788D]">Usage shows here once a project has its widget installed.</p>
            <Link href={DASHBOARD_HOME} className={`mt-5 inline-block ${BUTTON_PRIMARY}`}>
              Create a project
            </Link>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-[#E3E7EE] rounded-xl border border-[#E3E7EE] bg-white">
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
                      className={`block truncate rounded-sm font-medium text-[#161A24] underline-offset-4 hover:underline ${FOCUS}`}
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
        <h2 id="compare-heading" className="mb-4 text-lg font-semibold text-[#161A24]" style={FONT_DISPLAY}>
          Compare plans
        </h2>
        <PlanComparison plan={plan} />
      </section>
    </div>
  );
}
