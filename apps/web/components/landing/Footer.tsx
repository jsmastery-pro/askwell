import { APP_NAME } from "@askwell/shared";
import { FONT_DISPLAY } from "./fonts";
import { Section } from "./Section";
import { FOCUS_RING } from "./styles";

const LINK = `rounded-sm transition-colors hover:text-ink ${FOCUS_RING}`;

export function Footer() {
  return (
    <footer className="py-12">
      <Section className="flex flex-col items-start justify-between gap-8 border-t border-line pt-10 sm:flex-row sm:items-end">
        <div>
          <p className="text-lg font-semibold text-ink" style={FONT_DISPLAY}>
            {APP_NAME}
          </p>
          <p className="mt-1 text-sm text-muted">Answers from your docs, nowhere else.</p>
          <p className="mt-6 text-sm text-muted">
            &copy; {new Date().getFullYear()} {APP_NAME}
          </p>
        </div>
        <div className="flex gap-6 text-sm text-muted">
          <a href="#how-it-works" className={LINK}>
            How it works
          </a>
          <a href="#pricing" className={LINK}>
            Pricing
          </a>
        </div>
      </Section>
    </footer>
  );
}
