// postMessage contract between the loader (customer's page) and the panel (/embed iframe).
// No imports: the loader bundle must stay under 5 kb, so it imports this via
// "@askwell/shared/widget-messages" instead of the zod-based entry point.
// The guards check shape only. Callers must still check event.origin (§9).

export const WIDGET_MESSAGE_SOURCE = "askwell-widget";

export type PanelToLoaderMessage =
  | { source: typeof WIDGET_MESSAGE_SOURCE; type: "close" }
  | { source: typeof WIDGET_MESSAGE_SOURCE; type: "resize"; height: number }
  | { source: typeof WIDGET_MESSAGE_SOURCE; type: "unread"; count: number };

export type LoaderToPanelMessage = { source: typeof WIDGET_MESSAGE_SOURCE; type: "open" };

function isRecord(data: unknown): data is Record<string, unknown> {
  return typeof data === "object" && data !== null;
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function isPanelToLoaderMessage(data: unknown): data is PanelToLoaderMessage {
  if (!isRecord(data) || data.source !== WIDGET_MESSAGE_SOURCE) return false;
  switch (data.type) {
    case "close":
      return true;
    case "resize":
      return isNonNegativeNumber(data.height);
    case "unread":
      return isNonNegativeNumber(data.count) && Number.isInteger(data.count);
    default:
      return false;
  }
}

export function isLoaderToPanelMessage(data: unknown): data is LoaderToPanelMessage {
  return isRecord(data) && data.source === WIDGET_MESSAGE_SOURCE && data.type === "open";
}
