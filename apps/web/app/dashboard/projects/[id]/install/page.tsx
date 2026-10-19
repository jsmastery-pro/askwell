import { getOwnedProject } from "@askwell/db/queries";
import { auth } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { FONT_DISPLAY, FONT_MONO } from "../../../../../components/landing/fonts";
import { CopyButton } from "../../../../../components/projects/CopyButton";
import { buildInstallSnippet, resolveAppUrl } from "../../../../../components/projects/snippet";
import { SectionHeader } from "../../../../../components/ui/PageHeader";
import { FOCUS_ON_INK } from "../../../../../components/ui/styles";

export const dynamic = "force-dynamic";

const STEPS = [
  "Copy the snippet below.",
  "Paste it just before the closing </body> tag on every page that should show the chat.",
  "Reload your site. The chat button appears in the corner.",
];

export default async function InstallPage({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth.protect();
  const { id } = await params;
  // Not found and not owned look the same (§9).
  const project = await getOwnedProject(id, userId);
  if (!project) notFound();

  const snippet = buildInstallSnippet(resolveAppUrl(await headers()), project.publicKey);

  return (
    <div className="max-w-3xl">
      <SectionHeader
        title="Install"
        description="Add one script tag to your site. The chat button then shows on every page that has it."
      />
      <ol className="mt-6 space-y-3">
        {STEPS.map((step, index) => (
          <li key={step} className="flex gap-3 text-ink">
            <span className="font-semibold text-ink" style={FONT_DISPLAY}>
              {index + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <div className="mt-8 rounded-xl bg-ink p-5">
        {/* A scrollable pre is keyboard-focusable: on the black panel it needs the white ring. */}
        <pre className={`overflow-x-auto rounded-sm text-sm text-inverse/85 ${FOCUS_ON_INK}`} style={FONT_MONO}>
          <code>{snippet}</code>
        </pre>
      </div>
      <div className="mt-4">
        <CopyButton text={snippet} />
      </div>
    </div>
  );
}
