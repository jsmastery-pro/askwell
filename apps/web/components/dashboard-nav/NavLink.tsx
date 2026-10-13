"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { FOCUS } from "../ui/styles";

/** Top navbar link. Current on its own page and every page under it, e.g. a project's tabs. */
export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`relative flex h-14 items-center px-3 text-sm font-medium after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full ${
        active ? "text-white after:bg-[#F2A33C]" : "text-[#C3C9D6] hover:text-white"
      } ${FOCUS}`}
    >
      {children}
    </Link>
  );
}
