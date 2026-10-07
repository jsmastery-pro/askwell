import Link from "next/link";
import { APP_NAME } from "@askwell/shared";
import { FONT_DISPLAY } from "./fonts";
import { Section } from "./Section";

export function Nav() {
  return (
    <Section className="flex items-center justify-between py-6">
      <span className="text-lg font-semibold text-white" style={FONT_DISPLAY}>
        {APP_NAME}
      </span>
      <div className="hidden items-center gap-8 text-sm text-[#C3C9D6] sm:flex">
        <a href="#how-it-works" className="hover:text-white">
          How it works
        </a>
        <a href="#pricing" className="hover:text-white">
          Pricing
        </a>
        <Link href="/sign-in" className="hover:text-white">
          Sign in
        </Link>
      </div>
      <Link
        href="/sign-up"
        className="rounded-md bg-[#F2A33C] px-4 py-2 text-sm font-medium text-[#161A24] transition hover:bg-[#F5B35C]"
      >
        Start free
      </Link>
    </Section>
  );
}
