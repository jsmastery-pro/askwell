import type { WidgetConfig, WidgetConfigResponse } from "@askwell/shared";
import {
  WIDGET_MESSAGE_SOURCE,
  isPanelToLoaderMessage,
  type LoaderToPanelMessage,
} from "@askwell/shared/widget-messages";
import { textColorOn } from "./contrast";
import { CSS } from "./styles";

const MIN_PANEL_HEIGHT = 200;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

// Mirrors WIDGET_POSITIONS / WIDGET_ANIMATIONS. Importing those pulls zod into the
// bundle (they share a module with the schemas); `satisfies` fails typecheck if
// the shared lists change and these don't.
const POSITIONS = {
  "bottom-right": true,
  "bottom-left": true,
  "top-right": true,
  "top-left": true,
} satisfies Record<WidgetConfig["position"], true>;
const ANIMATIONS = { fade: true, slide: true, scale: true } satisfies Record<
  WidgetConfig["animation"],
  true
>;
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
    const body = (await res.json()) as Partial<WidgetConfigResponse> | null;
    return isRenderable(body?.config) ? body.config : null;
  } catch {
    return null;
  }
}

// Hand-rolled instead of the shared zod schema: zod would push the loader past
// its 5 kB budget (project.md §3).
function isRenderable(config: unknown): config is WidgetConfig {
  if (typeof config !== "object" || config === null) return false;
  const c = config as Record<string, unknown>;
  return (
    Object.hasOwn(POSITIONS, String(c.position)) &&
    Object.hasOwn(ANIMATIONS, String(c.animation)) &&
    typeof c.buttonColor === "string" &&
    HEX_COLOR.test(c.buttonColor) &&
    typeof c.label === "string" &&
    typeof c.headerText === "string"
  );
}

function bodyReady(doc: Document): Promise<void> {
  if (doc.body) return Promise.resolve();
  return new Promise((resolve) =>
    doc.addEventListener("DOMContentLoaded", () => resolve(), { once: true }),
  );
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
