import type { WidgetConfig, WidgetConfigResponse } from "@askwell/shared";
import {
  WIDGET_MESSAGE_SOURCE,
  isPanelToLoaderMessage,
  type LoaderToPanelMessage,
} from "@askwell/shared/widget-messages";
import { CSS } from "./styles";

const MIN_PANEL_HEIGHT = 200;
const OPEN: LoaderToPanelMessage = { source: WIDGET_MESSAGE_SOURCE, type: "open" };

export type Unmount = () => void;

export async function mountWidget(script: HTMLScriptElement): Promise<Unmount | null> {
  const key = script.dataset.key;
  const doc = script.ownerDocument;
  const win = doc.defaultView;
  if (!key || !script.src || !win) return null;

  const appOrigin = new URL(script.src).origin;
  const config = await fetchConfig(appOrigin, key);
  if (!config) return null;

  await bodyReady(doc);
  return render(doc, win, appOrigin, key, config);
}

async function fetchConfig(appOrigin: string, key: string): Promise<WidgetConfig | null> {
  try {
    const res = await fetch(`${appOrigin}/api/widget/config?key=${encodeURIComponent(key)}`, {
      credentials: "omit",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as Partial<WidgetConfigResponse>;
    return body.config ?? null;
  } catch {
    return null;
  }
}

function bodyReady(doc: Document): Promise<void> {
  if (doc.body) return Promise.resolve();
  return new Promise((resolve) =>
    doc.addEventListener("DOMContentLoaded", () => resolve(), { once: true }),
  );
}

function textColorOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const luminance = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return luminance > 160 ? "#111" : "#fff";
}

function render(
  doc: Document,
  win: Window,
  appOrigin: string,
  key: string,
  config: WidgetConfig,
): Unmount {
  const [vertical, horizontal] = config.position.split("-");

  const host = doc.createElement("div");
  host.setAttribute("data-askwell", "");
  const root = host.attachShadow({ mode: "open" });

  const style = doc.createElement("style");
  style.textContent = CSS;

  const wrap = doc.createElement("div");
  wrap.className = `w ${vertical} ${horizontal} ${config.animation}`;

  const button = doc.createElement("button");
  button.type = "button";
  button.style.background = config.buttonColor;
  button.style.color = textColorOn(config.buttonColor);
  button.setAttribute("aria-expanded", "false");
  const label = doc.createElement("span");
  label.textContent = config.label;
  const badge = doc.createElement("span");
  badge.className = "n";
  badge.hidden = true;
  button.append(label, badge);

  wrap.append(button);
  root.append(style, wrap);
  doc.body.append(host);

  let frame: HTMLIFrameElement | null = null;
  let loaded = false;
  let open = false;

  const post = () => {
    if (loaded) frame?.contentWindow?.postMessage(OPEN, appOrigin);
  };

  const setUnread = (count: number) => {
    badge.hidden = open || count === 0;
    badge.textContent = String(count);
    button.setAttribute("aria-label", badge.hidden ? config.label : `${config.label}, ${count} unread`);
  };

  const ensureFrame = (): HTMLIFrameElement => {
    if (frame) return frame;
    const params = new URLSearchParams({ key, origin: win.location.origin });
    const f = doc.createElement("iframe");
    f.src = `${appOrigin}/embed?${params}`;
    f.title = config.headerText;
    f.style.transformOrigin = `${vertical} ${horizontal}`;
    f.addEventListener("load", () => {
      loaded = true;
      if (open) post();
    });
    wrap.prepend(f);
    frame = f;
    return f;
  };

  const show = () => {
    const f = ensureFrame();
    open = true;
    f.classList.add("o");
    button.setAttribute("aria-expanded", "true");
    setUnread(0);
    post();
    f.focus();
  };

  const hide = () => {
    if (!open) return;
    open = false;
    frame?.classList.remove("o");
    button.setAttribute("aria-expanded", "false");
    button.focus();
  };

  const onMessage = (event: MessageEvent) => {
    if (event.origin !== appOrigin || !frame || event.source !== frame.contentWindow) return;
    const data: unknown = event.data;
    if (!isPanelToLoaderMessage(data)) return;
    if (data.type === "close") hide();
    else if (data.type === "resize") frame.style.height = `${Math.max(MIN_PANEL_HEIGHT, data.height)}px`;
    else setUnread(data.count);
  };

  button.addEventListener("click", () => (open ? hide() : show()));
  wrap.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hide();
  });
  win.addEventListener("message", onMessage);

  return () => {
    win.removeEventListener("message", onMessage);
    host.remove();
  };
}
