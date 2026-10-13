import { APP_NAME, PLAN_LIMITS } from "@askwell/shared";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { FONT_DISPLAY } from "../../components/landing/fonts";
import { formatCount } from "../../components/project-shell/format";
import { UsageMeter } from "../../components/project-shell/UsageMeter";
import { BUTTON_PRIMARY, FOCUS } from "../../components/projects/styles";
import { getAccountPlan } from "../../lib/data/billing";
import { listProjects } from "../../lib/projects";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { userId } = await auth.protect();
  const [projects, plan] = await Promise.all([listProjects(userId), getAccountPlan(userId)]);
  const limits = PLAN_LIMITS[plan];
  const atLimit = projects.length >= limits.projects;

  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-semibold text-[#161A24]" style={FONT_DISPLAY}>
        Welcome to {APP_NAME}
      </h1>
      <p className="mt-4 leading-relaxed text-[#70788D]">
        Each project has its own knowledge, chat widget and conversations.
      </p>

      <section aria-labelledby="projects-heading" className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="projects-heading" className="text-lg font-semibold text-[#161A24]" style={FONT_DISPLAY}>
            Your projects
          </h2>
          {projects.length > 0 && !atLimit && (
            <Link href="/dashboard/projects" className={BUTTON_PRIMARY}>
              Create project
            </Link>
          )}
        </div>

        {projects.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-[#CBD2DE] bg-white px-6 py-12 text-center">
            <p className="font-medium text-[#161A24]">No projects yet</p>
            <p className="mt-1 text-sm text-[#70788D]">
              Create a project to get a chat widget for your site.
            </p>
            <Link href="/dashboard/projects" className={`mt-5 inline-block ${BUTTON_PRIMARY}`}>
              Create your first project
            </Link>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-[#D7DCE6] border-y border-[#D7DCE6]">
            {projects.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/dashboard/projects/${project.id}`}
                  className={`flex flex-col gap-2 py-4 hover:bg-white/60 sm:flex-row sm:items-center sm:gap-6 ${FOCUS}`}
                >
                  <span className="min-w-0 flex-1 truncate font-medium text-[#161A24]">{project.name}</span>
                  <span className="flex w-full items-center gap-3 sm:w-64">
                    <span className="flex-1">
                      <UsageMeter
                        used={project.messagesUsed}
                        limit={limits.messagesPerMonth}
                        label={`${project.name}: messages used this month`}
                      />
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-[#70788D]">
                      {formatCount(project.messagesUsed)} / {formatCount(limits.messagesPerMonth)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {atLimit && projects.length > 0 && (
          <p className="mt-4 text-sm text-[#70788D]">
            Your plan includes {limits.projects} {limits.projects === 1 ? "project" : "projects"}.{" "}
            <Link href="/dashboard/billing" className={`font-medium text-[#161A24] underline underline-offset-4 ${FOCUS}`}>
              Upgrade to Pro
            </Link>{" "}
            for more.
          </p>
        )}
      </section>
    </div>
  );
}
