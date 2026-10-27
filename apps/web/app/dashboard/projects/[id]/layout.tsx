import type { ReactNode } from "react";
import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { FONT_DISPLAY, FONT_MONO } from "../../../../components/landing/fonts";
import { ProjectTabs } from "../../../../components/project-shell/ProjectTabs";
import { getOwnedProject } from "../../../../lib/projects";

export const dynamic = "force-dynamic";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  await auth.protect();
  const { id } = await params;
  // Not found and not owned look the same (project.md §9): RLS hides other owners' projects.
  const project = await getOwnedProject(id);
  if (!project) notFound();

  return (
    <div className="max-w-5xl">
      <header className="mb-6">
        <h1 className="break-words text-3xl font-semibold text-ink" style={FONT_DISPLAY}>
          {project.name}
        </h1>
        <p className="mt-1 truncate text-xs text-muted" style={FONT_MONO}>
          {project.public_key}
        </p>
      </header>
      <ProjectTabs projectId={project.id} />
      <div className="pt-8">{children}</div>
    </div>
  );
}
