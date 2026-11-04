import type { Metadata } from "next";
import { Suspense } from "react";
import { KnowledgeSkeleton } from "../../../../../components/knowledge/KnowledgeSkeleton";
import { KnowledgeSection } from "./KnowledgeSection";

export const metadata: Metadata = { title: "Knowledge" };

// A project's knowledge (§6.4): list, paste text, upload files, delete. The
// list and the plan are read on the server inside <Suspense> (they read the
// session); changes go through the knowledge routes from client components.
export default async function KnowledgePage({ params }: PageProps<"/dashboard/projects/[id]/knowledge">) {
  const { id } = await params;
  return (
    <Suspense fallback={<KnowledgeSkeleton />}>
      <KnowledgeSection projectId={id} />
    </Suspense>
  );
}
