import type { Metadata } from "next";
import { Suspense } from "react";
import { CustomizeSkeleton } from "../../../../../components/customize/CustomizeSkeleton";
import { CustomizeSection } from "./CustomizeSection";

export const metadata: Metadata = { title: "Customize" };

// Widget customization (§6.8): the form and a live preview. Pro saves through
// PATCH /api/projects/:id/config; Free sees the form locked with an upgrade
// prompt (the route's 402 is the real gate).
export default async function CustomizePage({ params }: PageProps<"/dashboard/projects/[id]/customize">) {
  const { id } = await params;
  return (
    <Suspense fallback={<CustomizeSkeleton />}>
      <CustomizeSection projectId={id} />
    </Suspense>
  );
}
