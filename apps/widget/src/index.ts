// Widget loader (project.md §6.5): the one file a customer pastes into their
// site. Under 5 kb. Bundled as an IIFE, so it defines no globals.
//
//   <script src="https://<app>/widget.js" data-key="pk_..." async></script>
import { boot, type ScriptInfo } from "./boot";
import { mount } from "./mount";

/** Our own <script>: currentScript while it runs, else a `script[data-key]` pointing at widget.js. */
function findScript(): ScriptInfo | null {
  const current = document.currentScript;
  const script =
    current instanceof HTMLScriptElement && current.hasAttribute("data-key")
      ? current
      : document.querySelector<HTMLScriptElement>('script[data-key][src*="widget.js"]');
  return script ? { src: script.src, key: script.getAttribute("data-key") } : null;
}

const whenBodyReady = (fn: () => void) => {
  if (document.body) fn();
  else document.addEventListener("DOMContentLoaded", fn, { once: true });
};

// Read the tag now: currentScript is null once this first run is over.
void boot(findScript(), {
  fetch,
  mount: (config, base, key) => whenBodyReady(() => mount(config, base, key, document, window)),
  warn: (message) => console.warn(message),
});
