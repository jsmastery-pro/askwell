import { loadOwnPlan } from "../../lib/accounts/account";
import { listOwnProjects } from "../../lib/projects/projects";
import { GlassPanel, Skeleton } from "../ui";
import { ProjectsManager } from "./ProjectsManager";

/**
 * Reads the owner's projects (owner client, RLS) and plan on the server, then
 * hands them to the client-side manager. Render inside <Suspense>: it reads
 * the request's session. `now` is the server's clock, so each card's usage
 * (lib/usage) is worked out the same way on the server and in the browser.
 */
export async function ProjectsSection() {
  const [projects, plan] = await Promise.all([listOwnProjects(), loadOwnPlan()]);
  // After loadOwnPlan's connection(): request time, never a prerender.
  const now = new Date().toISOString();
  return <ProjectsManager initialProjects={projects} plan={plan} now={now} />;
}

/** Placeholder with the same layout as ProjectsManager. */
export function ProjectsSkeleton() {
  return (
    <div role="status" aria-label="Loading projects" className="flex flex-col gap-6">
      <GlassPanel className="flex flex-col gap-3">
        <Skeleton shape="text" className="w-28" />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full sm:w-36" />
        </div>
      </GlassPanel>
      <div className="grid gap-4 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <GlassPanel key={i} className="flex flex-col gap-3">
            <Skeleton shape="text" className="w-40 max-w-full" />
            <Skeleton shape="text" className="w-24" />
            <Skeleton shape="text" className="w-44 max-w-full" />
            <Skeleton className="h-1.5 w-full" />
            <Skeleton className="h-8 w-48 max-w-full" />
          </GlassPanel>
        ))}
      </div>
    </div>
  );
}
