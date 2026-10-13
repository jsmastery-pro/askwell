import { PLAN_LIMITS } from "@askwell/shared";
import { auth } from "@clerk/nextjs/server";
import { FONT_DISPLAY } from "../../../components/landing/fonts";
import { ProjectsManager } from "../../../components/projects/ProjectsManager";
import { getAccountPlan } from "../../../lib/data/billing";
import { listProjects, toProject } from "../../../lib/projects";

export const dynamic = "force-dynamic";

// The dashboard's home: every project with its usage this month.
export default async function ProjectsPage() {
  const { userId } = await auth.protect();
  const [rows, plan] = await Promise.all([listProjects(userId), getAccountPlan(userId)]);
  const limits = PLAN_LIMITS[plan];

  return (
    <div>
      <h1 className="text-3xl font-semibold text-[#161A24]" style={FONT_DISPLAY}>
        Projects
      </h1>
      <p className="mt-3 mb-8 max-w-prose text-[#70788D]">
        Each project has its own widget, knowledge and conversations.
      </p>
      <ProjectsManager
        initialProjects={rows.map(toProject)}
        plan={plan}
        limit={limits.projects}
        messagesLimit={limits.messagesPerMonth}
      />
    </div>
  );
}
