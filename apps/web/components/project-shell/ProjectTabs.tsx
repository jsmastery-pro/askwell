"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FOCUS } from "../ui/styles";

const TABS = [
  { label: "Overview", path: "" },
  { label: "Knowledge", path: "/knowledge" },
  { label: "Conversations", path: "/conversations" },
  { label: "Customize", path: "/customize" },
  { label: "Install", path: "/install" },
] as const;

export function ProjectTabs({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/dashboard/projects/${projectId}`;

  return (
    <nav aria-label="Project" className="-mx-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6 md:mx-0 md:px-0">
      <ul className="flex min-w-max gap-6 border-b border-line">
        {TABS.map((tab) => {
          const href = base + tab.path;
          const active = tab.path === "" ? pathname === base : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={tab.label}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`-mb-px block border-b-2 py-3 text-sm font-medium ${
                  active
                    ? "border-ink text-ink"
                    : "border-transparent text-muted hover:text-ink"
                } ${FOCUS}`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
