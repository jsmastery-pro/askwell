import { ALLOWED_FILE_EXTENSIONS } from "@askwell/shared";
import { GlassPanel } from "../ui";
import { cx } from "../ui/cx";
import { REVEAL } from "./motion";
import { Section } from "./Section";

const fileTypes = ALLOWED_FILE_EXTENSIONS.map((ext) => ext.toUpperCase()).join(", ");

const steps = [
  {
    title: "Add your info",
    body: `Upload ${fileTypes} files, or paste text. The bot answers from what you add.`,
  },
  {
    title: "Paste one script tag",
    body: "Copy one line from your dashboard into your site's HTML. It works on any website.",
  },
  {
    title: "The bot answers visitors",
    body: "Visitors ask in the chat and get answers from your info. You read every conversation.",
  },
];

export function HowItWorks() {
  return (
    <Section id="how-it-works" eyebrow="How it works" title="Live on your site in three steps">
      <ol className="grid gap-4 sm:grid-cols-3">
        {steps.map((step, i) => (
          <li key={step.title} className={REVEAL}>
            <GlassPanel as="article" padding="lg" className="flex h-full flex-col gap-3">
              <span
                aria-hidden="true"
                className={cx(
                  "flex size-8 items-center justify-center rounded-full border border-line-strong",
                  "font-mono text-sm text-fg-muted",
                )}
              >
                {i + 1}
              </span>
              <h3 className="text-lg font-medium">{step.title}</h3>
              <p className="text-sm text-fg-muted">{step.body}</p>
            </GlassPanel>
          </li>
        ))}
      </ol>
    </Section>
  );
}
