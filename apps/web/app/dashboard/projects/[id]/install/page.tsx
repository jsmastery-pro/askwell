import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { APP_NAME } from "@askwell/shared";
import { InstallSnippet } from "../../../../../components/projects/InstallSnippet";
import { GlassPanel } from "../../../../../components/ui";
import { installSnippet, requestOrigin, resolveAppUrl } from "../../../../../lib/install/snippet";
import { loadProject } from "../project";

export const metadata: Metadata = { title: "Install" };

// The install snippet (§6.9): one script tag with the project's public key.
// widget.js is served from this app: NEXT_PUBLIC_APP_URL when set, otherwise
// this request's own origin (each Vercel preview has its own URL).
export default async function InstallPage({ params }: PageProps<"/dashboard/projects/[id]/install">) {
  const { id } = await params;
  const project = await loadProject(id);
  if (!project) notFound();

  const appUrl = resolveAppUrl(process.env.NEXT_PUBLIC_APP_URL, requestOrigin(await headers()));
  const snippet = installSnippet(appUrl, project.public_key);

  return (
    <section aria-labelledby="install-heading" className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 id="install-heading" className="text-lg font-semibold text-fg">
          Add the chat widget to your site
        </h2>
        <p className="text-sm text-fg-muted">
          Paste this once and the {APP_NAME} chat button appears on every page that has it.
        </p>
      </div>

      <InstallSnippet snippet={snippet} />

      <GlassPanel>
        <ol className="flex list-inside list-decimal flex-col gap-3 text-sm text-fg marker:text-fg-muted">
          <li>Copy the script tag above.</li>
          <li>
            Paste it into your site&apos;s HTML, just before the closing{" "}
            <code className="font-mono">&lt;/body&gt;</code> tag.
          </li>
          <li>Publish and reload the page. The chat button appears in the corner.</li>
        </ol>
      </GlassPanel>

      <p className="min-w-0 break-all text-sm text-fg-muted">
        Public key: <code className="font-mono text-fg">{project.public_key}</code>. It only identifies this
        project; it can&apos;t change anything.
      </p>
    </section>
  );
}
