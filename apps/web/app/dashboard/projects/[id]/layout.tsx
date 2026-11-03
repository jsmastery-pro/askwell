import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ProjectNav, ProjectNavFallback } from "../../../../components/projects/ProjectNav";
import { loadProject } from "./project";

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
      </header>
      {/* usePathname() can't resolve an unknown [id] while prerendering. */}
      <Suspense fallback={<ProjectNavFallback projectId={project.id} />}>
        <ProjectNav projectId={project.id} />
      </Suspense>
      {children}
    </div>
  );
}
