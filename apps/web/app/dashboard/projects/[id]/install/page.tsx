import { getOwnedProject } from "@askwell/db/queries";
import { auth } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FONT_DISPLAY, FONT_MONO } from "../../../../../components/landing/fonts";
import { CopyButton } from "../../../../../components/projects/CopyButton";
import { buildInstallSnippet, resolveAppUrl } from "../../../../../components/projects/snippet";
import { FOCUS } from "../../../../../components/projects/styles";

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
      <Link href="/dashboard/projects" className={`text-sm text-[#70788D] hover:text-[#161A24] ${FOCUS}`}>
        ← Projects
      </Link>
      <h1 className="mt-3 text-3xl font-semibold text-[#161A24]" style={FONT_DISPLAY}>
        Install {project.name}
      </h1>
      <ol className="mt-6 space-y-3">
        {STEPS.map((step, index) => (
          <li key={step} className="flex gap-3 text-[#3D4456]">
            <span className="font-semibold text-[#F2A33C]" style={FONT_DISPLAY}>
              {index + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <div className="mt-8 rounded-xl bg-[#10131D] p-5">
        <pre className="overflow-x-auto text-sm text-[#C3C9D6]" style={FONT_MONO}>
          <code>{snippet}</code>
        </pre>
      </div>
      <div className="mt-4">
        <CopyButton text={snippet} />
      </div>
    </div>
  );
}
