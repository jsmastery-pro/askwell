import { BrowserFrame } from "./BrowserFrame";
import { FONT_DISPLAY, FONT_MONO } from "./fonts";
import { Section } from "./Section";

const STEPS = [
  "Copy your snippet from Install.",
  "Paste it before your closing </body> tag.",
  "Refresh your site — the button appears.",
];

export function InstallSnippet() {
  return (
    <section className="bg-[#10131D] py-24">
      <Section className="grid grid-cols-1 items-center gap-16 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <h2 className="text-3xl font-semibold text-white" style={FONT_DISPLAY}>
            Install in one line.
          </h2>
          <ol className="mt-8 space-y-4">
            {STEPS.map((step, index) => (
              <li key={step} className="flex gap-4 text-[#C3C9D6]">
                <span className="text-lg font-semibold text-[#F2A33C]" style={FONT_DISPLAY}>
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
        <BrowserFrame url="yoursite.com/index.html">
          <pre className="overflow-x-auto p-2 text-sm text-[#C3C9D6]" style={FONT_MONO}>
            <code>{'<script src="https://askwell.app/widget.js" data-key="pk_..."></script>'}</code>
          </pre>
        </BrowserFrame>
      </Section>
    </section>
  );
}
