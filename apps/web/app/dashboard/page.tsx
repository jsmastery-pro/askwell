import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "../../components/dashboard/PageHeader";
import { ProjectsSection, ProjectsSkeleton } from "../../components/projects/ProjectsSection";

export const metadata: Metadata = { title: "Projects" };

// The owner's projects (§6.3): create, list, rename, delete. The list is read
// on the server inside <Suspense> (it reads the session); changes go through
// the /api/projects routes from client components.
export default function DashboardPage() {
  return (
    <>
      <PageHeader title="Projects" description="Each project is one chat bot for one website." />
      <Suspense fallback={<ProjectsSkeleton />}>
        <ProjectsSection />
      </Suspense>
    </>
  );
}
