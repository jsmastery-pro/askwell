import Link from "next/link";
import { APP_NAME } from "@askwell/shared";
import { FONT_DISPLAY } from "./fonts";
import { FOCUS_RING } from "./styles";

const LINK = `rounded-full px-3 py-1.5 text-muted transition-colors hover:text-ink ${FOCUS_RING}`;

/** A glass bar that stays at the top, so the page blurs underneath it as you scroll. */
export function Nav() {
  return (
    <div className="sticky top-3 z-40 px-3 sm:top-4 sm:px-6">
      <nav
        aria-label="Main"
        className="glass mx-auto flex max-w-[1180px] items-center justify-between gap-4 rounded-full py-2 pr-2 pl-5"
      >
        <Link href="/" className={`rounded-full text-lg font-semibold text-ink ${FOCUS_RING}`} style={FONT_DISPLAY}>
          {APP_NAME}
        </Link>
        <div className="hidden items-center gap-1 text-sm sm:flex">
          <a href="#how-it-works" className={LINK}>
            How it works
          </a>
          <a href="#pricing" className={LINK}>
            Pricing
          </a>
          <Link href="/sign-in" className={LINK}>
            Sign in
          </Link>
        </div>
        <Link
          href="/sign-up"
          className={`rounded-full bg-ink px-4 py-2 text-sm font-medium text-inverse transition duration-200 hover:bg-ink/90 ${FOCUS_RING}`}
        >
          Start free
        </Link>
      </nav>
    </div>
  );
}
