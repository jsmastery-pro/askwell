import type { Metadata } from "next";
import { publicKeySchema, type WidgetConfig } from "@askwell/shared";
import { getWidgetConfigByKey } from "../../lib/widget-config";
import { Panel } from "../../components/widget-panel/Panel";
import { Unavailable } from "../../components/widget-panel/Unavailable";
import { parentOriginFrom } from "./parent-origin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

type SearchParams = Promise<{ key?: string | string[]; origin?: string | string[] }>;

async function configFor(key: unknown): Promise<WidgetConfig | null> {
  const parsed = publicKeySchema.safeParse(key);
  if (!parsed.success) return null;
  try {
    return await getWidgetConfigByKey(parsed.data);
  } catch {
    return null;
  }
}

export default async function EmbedPage({ searchParams }: { searchParams: SearchParams }) {
  const { key, origin } = await searchParams;
  const config = await configFor(key);
  if (!config) return <Unavailable />;
  return <Panel config={config} parentOrigin={parentOriginFrom(origin)} />;
}
