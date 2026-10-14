import type { ReactNode } from "react";
import { FONT_DISPLAY } from "./fonts";
import { Reveal } from "./Reveal";
import { Section } from "./Section";
import { CARD } from "./styles";

const STEPS: { number: string; title: string; detail: string; icon: ReactNode }[] = [
  {
    number: "1",
    title: "Add your knowledge",
    detail:
      "Paste your product text or upload a PDF, Markdown, or TXT file. We chunk it and store it as embeddings automatically.",
    icon: (
      <path
        d="M7 3h7l4 4v14H7z M14 3v4h4 M10 12h6 M10 16h6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    ),
  },
  {
    number: "2",
    title: "Copy one script tag",
    detail: "Add it before your closing </body> tag. No build step, no SDK to install.",
    icon: (
      <path
        d="M8 9 4 13l4 4 M16 9l4 4-4 4 M13 7l-2 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    number: "3",
    title: "Visitors get real answers",
    detail:
      "The bot answers from your content only — and says it doesn't know rather than guessing.",
    icon: (
      <path
        d="M4 6h16v9H9l-5 4z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    ),
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-24 py-24 sm:py-28">
      <Section>
        <Reveal className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <h2 className="max-w-md text-3xl font-semibold tracking-[-0.02em] text-ink sm:text-4xl" style={FONT_DISPLAY}>
            From your docs to an answer in three steps.
          </h2>
          <p className="max-w-sm text-muted">No code beyond one script tag. No retraining, no prompt engineering.</p>
        </Reveal>
        <ol className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title}>
              <Reveal delay={index * 120} className={`${CARD} h-full p-6 sm:p-7`}>
                <div className="flex items-center justify-between">
                  <span className="text-4xl font-semibold text-ink" style={FONT_DISPLAY}>
                    {step.number}
                  </span>
                  <svg viewBox="0 0 24 24" className="h-6 w-6 text-muted" aria-hidden>
                    {step.icon}
                  </svg>
                </div>
                <h3 className="mt-8 font-medium text-ink">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{step.detail}</p>
              </Reveal>
            </li>
          ))}
        </ol>
      </Section>
    </section>
  );
}
