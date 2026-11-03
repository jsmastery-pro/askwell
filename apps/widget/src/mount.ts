// The button and the panel, in one host element with a closed shadow root.
// Nothing else is added to the host page, and nothing to `window`.
import type { WidgetSettings } from "@askwell/shared";
import { embedUrl } from "./config";
import { acceptMessage, clampHeight } from "./messages";
import { widgetCss } from "./styles";

/** Marks our host element, so a second copy of the script does nothing. */
export const HOST_ATTRIBUTE = "data-chat-widget";

export function mount(config: WidgetSettings, base: string, key: string, doc: Document, win: Window): void {
  if (doc.querySelector(`[${HOST_ATTRIBUTE}]`)) return;

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string) => {
    const node = doc.createElement(tag);
    if (cls) node.className = cls;
    return node;
  };

  const host = el("div");
  host.setAttribute(HOST_ATTRIBUTE, "");
  const root = host.attachShadow({ mode: "closed" });

  const style = el("style");
  style.textContent = widgetCss(config);

  const button = el("button", "b");
  button.type = "button";
  button.textContent = config.label;
  button.setAttribute("aria-label", config.label);
  button.setAttribute("aria-expanded", "false");
  const dot = el("span", "d");
  dot.setAttribute("aria-hidden", "true");
  button.append(dot);

  const panel = el("div", "p");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", config.header_text);

  // The panel after the button: on top when it fills the screen on phones.
  root.append(style, button, panel);

  let frame: HTMLIFrameElement | null = null;
  let open = false;

  const setUnread = (count: number) => {
    if (count > 0 && !open) {
      button.setAttribute("data-unread", "");
      button.setAttribute("aria-label", `${config.label} (new message)`);
    } else {
      button.removeAttribute("data-unread");
      button.setAttribute("aria-label", config.label);
    }
  };

  const show = (next: boolean) => {
    if (next === open) return;
    open = next;
    if (open && !frame) {
      // Created once, on the first open; kept (hidden) after that.
      frame = el("iframe");
      frame.title = config.header_text;
      frame.src = embedUrl(base, key, win.location.origin);
      panel.append(frame);
    }
    panel.classList.toggle("o", open);
    button.setAttribute("aria-expanded", String(open));
    if (open) {
      setUnread(0);
      frame?.focus();
    } else {
      button.focus();
    }
  };

  button.addEventListener("click", () => show(!open));

  doc.addEventListener("keydown", (event) => {
    if (open && event.key === "Escape") show(false);
  });

  win.addEventListener("message", (event) => {
    const message = acceptMessage(event, base, frame?.contentWindow);
    if (!message) return;
    if (message.type === "askwell:close") show(false);
    else if (message.type === "askwell:resize") panel.style.setProperty("--h", `${clampHeight(message.height)}px`);
    else setUnread(message.count);
  });

  doc.body.append(host);
}
