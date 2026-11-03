import { PUBLIC_KEY_PREFIX } from "@askwell/shared";
import { GlassPanel } from "../ui";
import { cx } from "../ui/cx";
import { CopyButton } from "./CopyButton";
import { REVEAL } from "./motion";
import { Section } from "./Section";

// An example tag with a placeholder key. Phase 2 brings the real script URL;
// owners copy their own tag (with their key) from the dashboard.
const EXAMPLE_SCRIPT_URL = "https://example.com/widget.js";
const EXAMPLE_KEY = `${PUBLIC_KEY_PREFIX}your_key`;

export const INSTALL_SNIPPET = `<script src="${EXAMPLE_SCRIPT_URL}" data-key="${EXAMPLE_KEY}" async></script>`;

export function Install() {
  return (
    <Section
      id="install"
      eyebrow="Install"
      title="One line of HTML"
      intro="Paste your script tag before the closing </body> tag. Your key comes from the dashboard."
    >
      <GlassPanel
        padding="none"
        className={cx("mx-auto w-full max-w-3xl overflow-hidden", REVEAL)}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2">
          <span className="font-mono text-xs text-fg-subtle">index.html</span>
          <CopyButton text={INSTALL_SNIPPET} />
        </div>
        <pre className="overflow-x-auto p-4 font-mono text-sm leading-relaxed sm:p-6">
          <code>{INSTALL_SNIPPET}</code>
        </pre>
      </GlassPanel>
    </Section>
  );
}
