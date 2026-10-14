import { BrowserFrame } from "./BrowserFrame";
import { FONT_DISPLAY, FONT_MONO } from "./fonts";
import { Reveal } from "./Reveal";
import { Section } from "./Section";

const STEPS = [
  "Copy your snippet from Install.",
  "Paste it before your closing </body> tag.",
  "Refresh your site — the button appears.",
];

export function InstallSnippet() {
  return (
    <section className="py-24 sm:py-28">
      <Section className="grid grid-cols-1 items-center gap-14 lg:grid-cols-[1fr_1.1fr]">
        <Reveal>
          <h2 className="text-3xl font-semibold tracking-[-0.02em] text-ink sm:text-4xl" style={FONT_DISPLAY}>
            Install in one line.
          </h2>
          <ol className="mt-8 space-y-4">
            {STEPS.map((step, index) => (
              <li key={step} className="flex gap-4 text-muted">
                <span className="text-lg font-semibold text-ink" style={FONT_DISPLAY}>
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </Reveal>
        <Reveal delay={120}>
          <BrowserFrame url="yoursite.com/index.html">
            <pre className="overflow-x-auto rounded-lg bg-surface p-4 text-sm text-ink" style={FONT_MONO}>
              <code>{'<script src="https://askwell.app/widget.js" data-key="pk_..."></script>'}</code>
            </pre>
          </BrowserFrame>
        </Reveal>
      </Section>
    </section>
  );
}
