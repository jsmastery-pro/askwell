import Link from "next/link";
import { APP_NAME } from "@askwell/shared";
import { FONT_DISPLAY } from "../landing/fonts";
import { FOCUS } from "../projects/styles";
import { AccountMenu } from "./AccountMenu";
import { NavLink } from "./NavLink";
import { BILLING_PATH, DASHBOARD_HOME } from "./routes";

/** Same width and gutters as the page content below it. */
export const DASHBOARD_FRAME = "mx-auto w-full max-w-5xl px-4 sm:px-6";

export function NavBar() {
  return (
    <header className="sticky top-0 z-30 bg-[#10131D]">
      <div className={`flex h-14 items-center gap-2 sm:gap-6 ${DASHBOARD_FRAME}`}>
        <Link
          href={DASHBOARD_HOME}
          className={`mr-1 rounded-sm text-lg font-semibold text-white ${FOCUS}`}
          style={FONT_DISPLAY}
        >
          {APP_NAME}
        </Link>
        <nav aria-label="Dashboard" className="flex-1">
          <ul className="flex">
            <li>
              <NavLink href={DASHBOARD_HOME}>Projects</NavLink>
            </li>
            <li>
              <NavLink href={BILLING_PATH}>Billing</NavLink>
            </li>
          </ul>
        </nav>
        <AccountMenu />
      </div>
    </header>
  );
}
