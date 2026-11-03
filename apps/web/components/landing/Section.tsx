import type { ReactNode } from "react";
import { cx } from "../ui/cx";
import { REVEAL } from "./motion";

export interface SectionProps {
  id: string;
  title: string;
  /** Short line above the title. */
  eyebrow?: string;
  /** Paragraph under the title. */
  intro?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** A landing section with a heading block. Fades in as it scrolls into view. */
export function Section({ id, title, eyebrow, intro, children, className }: SectionProps) {
  const headingId = `${id}-title`;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cx("mx-auto w-full max-w-5xl scroll-mt-8 px-4 py-20 sm:px-6 sm:py-28", className)}
    >
      <div className={cx("mx-auto mb-12 flex max-w-2xl flex-col items-center gap-3 text-center", REVEAL)}>
        {eyebrow && (
          <p className="text-xs font-medium uppercase tracking-wider text-fg-subtle">{eyebrow}</p>
        )}
        <h2 id={headingId} className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {title}
        </h2>
        {intro && <p className="text-base text-pretty text-fg-muted sm:text-lg">{intro}</p>}
      </div>
      {children}
    </section>
  );
}
