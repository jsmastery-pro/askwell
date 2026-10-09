"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { FOCUS } from "./styles";

/** Dashboard nav link that marks itself current. `exact` for the Overview root. */
export function NavLink({ href, exact = false, children }: { href: string; exact?: boolean; children: ReactNode }) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`block rounded-md px-3 py-2 text-sm font-medium ${
        active ? "bg-white/10 text-white" : "text-[#C3C9D6] hover:bg-white/5 hover:text-white"
      } ${FOCUS}`}
    >
      {children}
    </Link>
  );
}
