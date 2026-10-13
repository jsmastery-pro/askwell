"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { FOCUS } from "../ui/styles";

/**
 * Top navbar link. Current on its own page and every page under it, e.g. a project's tabs.
 * `exact` for the Dashboard, whose path is the prefix of every other page.
 */
export function NavLink({ href, exact = false, children }: { href: string; exact?: boolean; children: ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href || (!exact && pathname.startsWith(`${href}/`));
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`relative flex h-14 items-center px-2 text-sm font-medium after:absolute after:inset-x-2 max-[359px]:px-1 max-[359px]:text-[13px] max-[359px]:after:inset-x-1 sm:px-3 sm:after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full ${
        active ? "text-white after:bg-[#F2A33C]" : "text-[#C3C9D6] hover:text-white"
      } ${FOCUS}`}
    >
      {children}
    </Link>
  );
}
