"use client";

import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState, type ReactNode } from "react";
import { APP_NAME } from "@askwell/shared";
import { cx } from "../ui/cx";
import { CloseIcon, MenuIcon } from "./icons";
import { DASHBOARD_NAV, isNavItemActive } from "./nav";
import { ThemeToggle } from "./ThemeToggle";

export interface SidebarProps {
  /** The plan badge (a server component, streamed in). */
  plan: ReactNode;
}

/**
 * The dashboard's glass sidebar. Below `md` it's a top bar: name, plan, user
 * button and a menu button that shows the nav links. One set of elements for
 * both layouts, reordered with CSS.
 */
export function Sidebar({ plan }: SidebarProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState(pathname);
  const navId = useId();

  // Close the menu after navigating.
  if (open && pathname !== openedAt) setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <aside
      className={cx(
        "sticky top-0 z-20 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-3",
        "bg-glass-strong shadow-glass backdrop-blur-glass",
        "md:h-dvh md:w-60 md:shrink-0 md:flex-col md:flex-nowrap md:items-stretch md:gap-6 md:border-r md:border-b-0 md:p-5",
      )}
    >
      <Link
        href="/dashboard"
        className="order-1 min-w-0 flex-1 truncate rounded-control text-base font-semibold tracking-tight text-fg outline-none focus-visible:ring-2 focus-visible:ring-focus md:flex-none"
      >
        {APP_NAME}
      </Link>

      <div className="order-2 flex items-center gap-3 md:order-3 md:mt-auto md:justify-between md:border-t md:border-line md:pt-4">
        {plan}
        <UserButton />
      </div>

      <button
        type="button"
        className="order-3 inline-flex size-10 items-center justify-center rounded-control text-fg outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-focus md:hidden"
        aria-expanded={open}
        aria-controls={navId}
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => {
          setOpenedAt(pathname);
          setOpen((o) => !o);
        }}
      >
        {open ? <CloseIcon className="size-5" /> : <MenuIcon className="size-5" />}
      </button>

      <nav
        id={navId}
        aria-label="Dashboard"
        className={cx("order-4 basis-full md:order-2 md:block md:basis-auto", open ? "block" : "hidden")}
      >
        <ul className="flex flex-col gap-1 pb-1 md:pb-0">
          {DASHBOARD_NAV.map((item) => {
            const active = isNavItemActive(item, pathname);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "flex h-10 items-center rounded-control px-3 text-sm outline-none transition-colors",
                    "focus-visible:ring-2 focus-visible:ring-focus",
                    active ? "bg-hover font-medium text-fg" : "text-fg-muted hover:bg-hover hover:text-fg",
                  )}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="mt-4 border-t border-line pt-4 pb-1 md:pb-0">
          <ThemeToggle />
        </div>
      </nav>
    </aside>
  );
}
