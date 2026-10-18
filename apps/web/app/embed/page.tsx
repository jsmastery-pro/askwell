import type { Metadata } from "next";
import { publicKeySchema, type WidgetConfig } from "@askwell/shared";
import { getWidgetConfigByKey } from "../../lib/widget-config";
import { Panel } from "../../components/widget-panel/Panel";
import { Unavailable } from "../../components/widget-panel/Unavailable";
import { parentOriginFrom } from "./parent-origin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

type SearchParams = Promise<{ key?: string | string[]; origin?: string | string[] }>;

async function configFor(key: string): Promise<WidgetConfig | null> {
  try {
    return await getWidgetConfigByKey(key);
  } catch {
    return null;
  }
}

export default async function EmbedPage({ searchParams }: { searchParams: SearchParams }) {
  const { key, origin } = await searchParams;
  const parsed = publicKeySchema.safeParse(key);
  const config = parsed.success ? await configFor(parsed.data) : null;
  if (!parsed.success || !config) return <Unavailable />;
  return <Panel publicKey={parsed.data} config={config} parentOrigin={parentOriginFrom(origin)} />;
}
