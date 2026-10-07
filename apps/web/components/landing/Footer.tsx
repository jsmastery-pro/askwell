import { APP_NAME } from "@askwell/shared";
import { FONT_DISPLAY } from "./fonts";
import { Section } from "./Section";

export function Footer() {
  return (
    <footer className="bg-[#10131D] py-12">
      <Section className="flex flex-col items-start justify-between gap-8 border-t border-white/10 pt-10 sm:flex-row sm:items-end">
        <div>
          <p className="text-lg font-semibold text-white" style={FONT_DISPLAY}>
            {APP_NAME}
          </p>
          <p className="mt-1 text-sm text-[#70788D]">Answers from your docs, nowhere else.</p>
          <p className="mt-6 text-sm text-[#70788D]">
            &copy; {new Date().getFullYear()} {APP_NAME}
          </p>
        </div>
        <div className="flex gap-6 text-sm text-[#C3C9D6]">
          <a href="#how-it-works" className="hover:text-white">
            How it works
          </a>
          <a href="#pricing" className="hover:text-white">
            Pricing
          </a>
        </div>
      </Section>
    </footer>
  );
}
