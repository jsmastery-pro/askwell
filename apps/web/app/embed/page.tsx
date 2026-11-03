import type { Metadata } from "next";
import { Suspense } from "react";
import { APP_NAME, publicKeySchema } from "@askwell/shared";
import { parseHostOrigin } from "../../components/embed/bridge";
import { EmbedPanel } from "../../components/embed/EmbedPanel";
import { EmbedUnavailable } from "../../components/embed/EmbedUnavailable";
import { getPublicWidgetConfig } from "../../lib/widget/config";

export const metadata: Metadata = {
  title: `Chat · ${APP_NAME}`,
  robots: { index: false, follow: false },
};

// /embed?key=pk_…&origin=https://host.example: the chat panel inside the
// widget iframe (project.md §6.5). Any site may frame it: no X-Frame-Options
// or frame-ancestors here (§9 "Clickjacking").

const first = (value: string | string[] | undefined) => (typeof value === "string" ? value : null);

async function Embed({ searchParams }: Pick<PageProps<"/embed">, "searchParams">) {
  const params = await searchParams;
  const raw = first(params.key);
  const key = raw !== null && publicKeySchema.safeParse(raw).success ? raw : null;
  const hostOrigin = parseHostOrigin(first(params.origin));
  // A lookup failure (database down) shows the same state as an unknown key.
  const config = key
    ? await getPublicWidgetConfig(key).catch((error: unknown) => {
        console.error("Couldn't load the widget config", error);
        return null;
      })
    : null;

  if (!key || !config) return <EmbedUnavailable hostOrigin={hostOrigin} />;
  return <EmbedPanel config={config} publicKey={key} hostOrigin={hostOrigin} />;
}

export default function EmbedPage({ searchParams }: PageProps<"/embed">) {
  return (
    <Suspense fallback={<div data-surface="light" className="h-dvh" aria-busy="true" />}>
      <Embed searchParams={searchParams} />
    </Suspense>
  );
}
