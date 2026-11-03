import { APP_NAME, DEFAULT_WIDGET_CONFIG } from "@askwell/shared";
import { GlassPanel } from "../ui";
import { cx } from "../ui/cx";
import { REVEAL } from "./motion";
import { Section } from "./Section";

// A static mock of the chat panel. The real widget replaces it in Phase 6.

const sample = [
  { role: "visitor", text: "Do you ship to Canada?" },
  {
    role: "bot",
    text: "Yes. Orders to Canada ship in 3–5 business days, and shipping is free over $50.",
  },
  { role: "visitor", text: "Can I return a gift?" },
  {
    role: "bot",
    text: "You can return any unused item within 30 days. Gift returns get store credit.",
  },
] as const;

export function LiveDemo() {
  return (
    <Section
      id="demo"
      eyebrow="Live demo"
      title="See it answer"
      intro="A sample chat for an online store. The bot replies from the store's own shipping and returns pages."
    >
      <div className={cx("mx-auto flex w-full max-w-md flex-col items-end gap-4", REVEAL)}>
        <GlassPanel
          role="figure"
          variant="strong"
          padding="none"
          className="flex w-full flex-col overflow-hidden"
          aria-label="Preview of the chat panel"
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-sm font-medium">{DEFAULT_WIDGET_CONFIG.header_text}</p>
            <span className="rounded-full border border-line px-2 py-0.5 text-xs text-fg-subtle">
              Preview
            </span>
          </div>

          <ul className="flex flex-col gap-3 px-4 py-5" aria-label="Sample conversation">
            {sample.map((m, i) => (
              <li
                key={i}
                className={cx(
                  "max-w-[85%] rounded-control px-3 py-2 text-sm",
                  m.role === "visitor"
                    ? "self-end bg-primary text-primary-fg"
                    : "self-start border border-line bg-glass text-fg",
                )}
              >
                <span className="sr-only">{m.role === "visitor" ? "Visitor: " : "Bot: "}</span>
                {m.text}
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-2 border-t border-line px-4 py-3">
            <div
              aria-hidden="true"
              className="rounded-control border border-line px-3 py-2 text-sm text-fg-subtle"
            >
              Type a message…
            </div>
            <p className="text-center text-xs text-fg-subtle">Powered by {APP_NAME}</p>
          </div>
        </GlassPanel>

        <span
          aria-hidden="true"
          className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-fg shadow-glass"
        >
          {DEFAULT_WIDGET_CONFIG.label}
        </span>
      </div>
    </Section>
  );
}
