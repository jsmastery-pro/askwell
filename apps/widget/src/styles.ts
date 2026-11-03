// The widget's CSS. It lives inside a closed shadow root, so nothing leaks
// into the host page and the host's CSS can't reach in (`:host { all: initial }`).
import type { WidgetSettings } from "@askwell/shared";

/** Black or white text on `hex` (#rrggbb), by perceived brightness (YIQ). */
export function textColorOn(hex: string): string {
  const c = (i: number) => parseInt(hex.slice(i, i + 2), 16);
  return c(1) * 299 + c(3) * 587 + c(5) * 114 > 150_000 ? "#000" : "#fff";
}

/** The panel's starting transform for each animation (the open state is `none`). */
export function hiddenTransform(animation: WidgetSettings["animation"], top: boolean): string {
  if (animation === "slide") return `translateY(${top ? -16 : 16}px)`;
  if (animation === "scale") return "scale(.94)";
  return "none";
}

/** CSS for the button (`.b`), its unread dot (`.d`) and the panel (`.p`, open: `.p.o`). */
export function widgetCss(config: WidgetSettings): string {
  const [v, h] = config.position.split("-") as ["top" | "bottom", "left" | "right"];
  const color = config.button_color;
  const fg = textColorOn(color);
  const ease = ".2s cubic-bezier(.2,.7,.2,1)";
  return (
    // Same z-index: the panel comes after the button in the shadow root, so it's on top.
    `:host{all:initial}.b,.p{position:fixed;z-index:2147483647}` +
    `.b{${v}:20px;${h}:20px;display:inline-flex;align-items:center;` +
    `height:48px;max-width:calc(100vw - 40px);padding:0 20px;border:0;border-radius:999px;background:${color};color:${fg};` +
    `font:600 15px/1 system-ui,sans-serif;white-space:nowrap;overflow:hidden;` +
    `box-shadow:0 4px 16px rgba(0,0,0,.2);cursor:pointer}` +
    `.b:focus-visible{outline:3px solid ${color};outline-offset:3px}` +
    `.d{position:absolute;top:6px;${h === "right" ? "left" : "right"}:6px;width:10px;height:10px;border-radius:50%;` +
    `background:#e11d48;box-shadow:0 0 0 2px #fff;display:none}` +
    `.b[data-unread] .d{display:block}` +
    `.p{${v}:84px;${h}:20px;width:380px;max-width:calc(100vw - 40px);` +
    `height:min(var(--h,600px),calc(100vh - 104px));border-radius:16px;overflow:hidden;background:#fff;` +
    `box-shadow:0 12px 48px rgba(0,0,0,.25);transform-origin:${v} ${h};opacity:0;visibility:hidden;pointer-events:none;` +
    `transform:${hiddenTransform(config.animation, v === "top")};` +
    `transition:opacity ${ease},transform ${ease},visibility 0s .2s}` +
    // Opening shows the panel at once (no visibility delay); closing hides it after the fade.
    `.p.o{opacity:1;visibility:visible;pointer-events:auto;transform:none;transition-delay:0s}` +
    `.p iframe{display:block;width:100%;height:100%;border:0}` +
    `@media (max-width:479px){.p{top:0;right:0;bottom:0;left:0;width:auto;max-width:none;height:auto;border-radius:0}}` +
    `@media (prefers-reduced-motion:reduce){.p,.p.o{transition:none;transform:none}}`
  );
}
