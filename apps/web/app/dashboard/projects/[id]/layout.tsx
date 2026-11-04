import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ProjectNav, ProjectNavFallback } from "../../../../components/projects/ProjectNav";
import { Skeleton } from "../../../../components/ui";
import { UsageMeter } from "../../../../components/usage/UsageMeter";
import { loadProject, loadProjectUsage } from "./project";

/** The header's usage meter: streams in after the name (it reads the plan). */
async function HeaderUsage({ projectId }: { projectId: string }) {
  const usage = await loadProjectUsage(projectId);
  return usage ? <UsageMeter usage={usage} className="max-w-sm" /> : null;
}

function HeaderUsageSkeleton() {
  return (
    <div role="status" aria-label="Loading usage" className="flex max-w-sm flex-col gap-1.5">
      <Skeleton shape="text" className="w-44 max-w-full" />
      <Skeleton className="h-1.5 w-full" />
      <Skeleton shape="text" className="w-28" />
    </div>
  );
}

// A project's pages: its name and the sub-nav. Not the caller's (RLS) or
// missing → the 404 page, never 403, so other owners' projects stay invisible.
export default async function ProjectLayout({ children, params }: LayoutProps<"/dashboard/projects/[id]">) {
  const { id } = await params;
  const project = await loadProject(id);
  if (!project) notFound();

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <header className="flex min-w-0 flex-col gap-2">
        <Link
          href="/dashboard"
          className="self-start rounded-control text-sm text-fg-muted outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-focus"
        >
          ← All projects
        </Link>
        <h1 className="min-w-0 break-words text-2xl font-semibold tracking-tight text-fg">{project.name}</h1>
        <Suspense fallback={<HeaderUsageSkeleton />}>
          <HeaderUsage projectId={project.id} />
        </Suspense>
      </header>
      {/* usePathname() can't resolve an unknown [id] while prerendering. */}
      <Suspense fallback={<ProjectNavFallback projectId={project.id} />}>
        <ProjectNav projectId={project.id} />
      </Suspense>
      {children}
    </div>
  );
}
