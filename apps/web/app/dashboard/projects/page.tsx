import { PLAN_LIMITS } from "@askwell/shared";
import { auth } from "@clerk/nextjs/server";
import { ProjectsManager } from "../../../components/projects/ProjectsManager";
import { getAccountPlan } from "../../../lib/data/billing";
import { addOneMonth } from "../../../lib/data/usage";
import { listProjects, toProject } from "../../../lib/projects";
import { PageHeader } from "../../../components/ui/PageHeader";

export const dynamic = "force-dynamic";

// The dashboard's home: every project with its usage this month.
export default async function ProjectsPage() {
  const { userId } = await auth.protect();
  const [rows, plan] = await Promise.all([listProjects(userId), getAccountPlan(userId)]);
  const limits = PLAN_LIMITS[plan];

  return (
    <div>
      <PageHeader title="Projects" description="Each project has its own widget, knowledge and conversations." />
      <ProjectsManager
        initialProjects={rows.map(toProject)}
        plan={plan}
        limit={limits.projects}
        messagesLimit={limits.messagesPerMonth}
        resetsAt={Object.fromEntries(rows.map((row) => [row.id, addOneMonth(row.periodStart).toISOString()]))}
        now={new Date().toISOString()}
      />
    </div>
  );
}
