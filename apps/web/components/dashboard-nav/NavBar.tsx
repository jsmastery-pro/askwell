import Link from "next/link";
import { APP_NAME } from "@askwell/shared";
import { FONT_DISPLAY } from "../landing/fonts";
import { FOCUS } from "../ui/styles";
import { AccountMenu } from "./AccountMenu";
import { NavLink } from "./NavLink";
import { BILLING_PATH, OVERVIEW_PATH, PROJECTS_PATH } from "./routes";

/** Same width and gutters as the page content below it. */
export const DASHBOARD_FRAME = "mx-auto w-full max-w-5xl px-4 sm:px-6";

// Glass, so the page blurs underneath as it scrolls; only the bottom edge keeps its line.
export function NavBar() {
  return (
    <header className="glass sticky top-0 z-30 border-x-0 border-t-0">
      <div className={`flex h-14 items-center gap-1.5 sm:gap-6 ${DASHBOARD_FRAME}`}>
        <Link
          href={OVERVIEW_PATH}
          className={`mr-1 shrink-0 rounded-sm text-lg max-[359px]:text-base font-semibold text-ink ${FOCUS}`}
          style={FONT_DISPLAY}
        >
          {APP_NAME}
        </Link>
        <nav aria-label="Dashboard" className="flex-1">
          <ul className="flex">
            <li>
              <NavLink href={OVERVIEW_PATH} exact>
                Dashboard
              </NavLink>
            </li>
            <li>
              <NavLink href={PROJECTS_PATH}>Projects</NavLink>
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
