"use client";

import { useState } from "react";
import type { Plan, Project } from "@askwell/shared";
import { EmptyState, GlassPanel } from "../ui";
import { CreateProjectForm } from "./CreateProjectForm";
import { ProjectCard } from "./ProjectCard";

export interface ProjectsManagerProps {
  /** The owner's projects, newest first, read on the server. */
  initialProjects: Project[];
  /** The owner's plan, read on the server. Only used to word the limit prompt. */
  plan: Plan;
}

/** The /dashboard projects screen: create form + project cards (or the empty state). */
export function ProjectsManager({ initialProjects, plan }: ProjectsManagerProps) {
  const [projects, setProjects] = useState(initialProjects);

  return (
    <div className="flex flex-col gap-6">
      <GlassPanel>
        <CreateProjectForm
          plan={plan}
          onCreated={(project) => setProjects((current) => [project, ...current])}
        />
      </GlassPanel>

      {projects.length === 0 ? (
        <GlassPanel padding="none">
          <EmptyState
            title="No projects yet"
            description="Create a project, add what your bot should know, then paste one script tag on your site."
          />
        </GlassPanel>
      ) : (
        <ul aria-label="Your projects" className="grid min-w-0 gap-4 sm:grid-cols-2">
          {projects.map((project) => (
            <li key={project.id} className="min-w-0">
              <ProjectCard
                project={project}
                onRenamed={(renamed) =>
                  setProjects((current) => current.map((p) => (p.id === renamed.id ? renamed : p)))
                }
                onDeleted={(id) => setProjects((current) => current.filter((p) => p.id !== id))}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
