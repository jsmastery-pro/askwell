import type { ReactNode } from "react";
import { FONT_DISPLAY } from "./fonts";
import { Section } from "./Section";

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
    <section id="how-it-works" className="bg-[#EEF1F6] py-24">
      <Section>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <h2 className="max-w-md text-3xl font-semibold text-[#161A24]" style={FONT_DISPLAY}>
            From your docs to an answer in three steps.
          </h2>
          <p className="max-w-sm text-[#70788D]">
            No code beyond one script tag. No retraining, no prompt engineering.
          </p>
        </div>
        <div className="mt-16 grid grid-cols-1 gap-12 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <div key={step.title} className="relative pl-6">
              {index > 0 && (
                <span className="absolute left-0 top-2 hidden h-px w-6 -translate-x-full bg-[#CBD2DE] md:block" />
              )}
              <div className="flex items-center gap-3 text-[#161A24]">
                <svg viewBox="0 0 24 24" className="h-6 w-6 text-[#70788D]" aria-hidden>
                  {step.icon}
                </svg>
                <span className="text-2xl font-semibold" style={FONT_DISPLAY}>
                  {step.number}
                </span>
              </div>
              <h3 className="mt-4 font-medium text-[#161A24]">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#70788D]">{step.detail}</p>
            </div>
          ))}
        </div>
      </Section>
    </section>
  );
}
