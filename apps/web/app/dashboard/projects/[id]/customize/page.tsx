import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { CustomizeForm } from "../../../../../components/customize/CustomizeForm";
import { getWidgetConfig } from "../../../../../lib/data/config";
import { getOwnedProject } from "../../../../../lib/projects";
import { SectionHeader } from "../../../../../components/ui/PageHeader";

export const dynamic = "force-dynamic";

export default async function CustomizePage({ params }: { params: Promise<{ id: string }> }) {
  await auth.protect();
  const { id } = await params;
  // Ownership first, before any data call (docs/ui-track.md).
  const project = await getOwnedProject(id);
  if (!project) notFound();

  // Real: the stored config with the owner's plan applied, both read on the server (§9).
  const widget = await getWidgetConfig(project.id);
  if (!widget) notFound();

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Customize"
        description="Change how the chat looks on your site. The preview updates as you edit."
      />
      <CustomizeForm projectId={project.id} plan={widget.plan} initialConfig={widget.config} />
    </div>
  );
}
