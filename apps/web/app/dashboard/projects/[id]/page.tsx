import { redirect } from "next/navigation";

// A project opens on its first section. Install is the only one in Phase 2.
export default async function ProjectPage({ params }: PageProps<"/dashboard/projects/[id]">) {
  const { id } = await params;
  redirect(`/dashboard/projects/${encodeURIComponent(id)}/install`);
}
