import { accounts } from "@askwell/db";
import { db } from "@askwell/db/client";
import { PLAN_LIMITS } from "@askwell/shared";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { FONT_DISPLAY } from "../../../components/landing/fonts";
import { ProjectsManager } from "../../../components/projects/ProjectsManager";
import { listProjects, toProject } from "../../../lib/projects";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const { userId } = await auth.protect();
  const [rows, [account]] = await Promise.all([
    listProjects(userId),
    db.select({ plan: accounts.plan }).from(accounts).where(eq(accounts.clerkUserId, userId)),
  ]);

  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-semibold text-[#161A24]" style={FONT_DISPLAY}>
        Projects
      </h1>
      <p className="mt-3 mb-8 text-[#70788D]">Each project has its own widget, knowledge and conversations.</p>
      <ProjectsManager initialProjects={rows.map(toProject)} limit={PLAN_LIMITS[account?.plan ?? "free"].projects} />
    </div>
  );
}
