import { buildInstallSnippet } from "../projects/snippet";
import { BrowserFrame } from "./BrowserFrame";
import { FONT_DISPLAY, FONT_MONO } from "./fonts";
import { Reveal } from "./Reveal";
import { Section } from "./Section";

const STEPS = [
  "Copy your snippet from Install.",
  "Paste it before your closing </body> tag.",
  "Refresh your site — the button appears.",
];

/** `appUrl`: this app's public URL, resolved per request (see resolveAppUrl). */
export function InstallSnippet({ appUrl }: { appUrl: string }) {
  return (
    <section className="py-24 sm:py-28">
      {/* minmax(0, …): the snippet's long URL can't widen its column past its share of the row. */}
      <Section className="grid grid-cols-1 items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
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
            {/* Wraps anywhere so the whole tag shows at any width. Visual only: the text is still the one-line tag. */}
            <pre className="rounded-lg bg-surface p-4 text-sm break-all whitespace-pre-wrap text-ink" style={FONT_MONO}>
              <code>{buildInstallSnippet(appUrl, "pk_...")}</code>
            </pre>
          </BrowserFrame>
        </Reveal>
      </Section>
    </section>
  );
}
