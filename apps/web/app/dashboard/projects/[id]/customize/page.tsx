import { getOwnedProject } from "@askwell/db/queries";
import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { CustomizeForm } from "../../../../../components/customize/CustomizeForm";
import { FONT_DISPLAY } from "../../../../../components/landing/fonts";
import { getWidgetConfig } from "../../../../../lib/data/config";

export const dynamic = "force-dynamic";

export default async function CustomizePage({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth.protect();
  const { id } = await params;
  // Ownership first, before any data call (docs/ui-track.md).
  const project = await getOwnedProject(id, userId);
  if (!project) notFound();

  // Real: the stored config with the owner's plan applied, both read on the server (§9).
  const widget = await getWidgetConfig(userId, project.id);
  if (!widget) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-[#161A24]" style={FONT_DISPLAY}>
          Customize
        </h2>
        <p className="mt-2 max-w-xl text-sm text-[#70788D]">
          Change how the chat looks on your site. The preview updates as you edit.
        </p>
      </div>
      <CustomizeForm projectId={project.id} plan={widget.plan} initialConfig={widget.config} />
    </div>
  );
}
