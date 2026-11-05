"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "../ui/cx";

/** A project's sections, in nav order. */
export function projectSections(projectId: string): { label: string; href: string }[] {
  return [
    { label: "Conversations", href: `/dashboard/projects/${projectId}/conversations` },
    { label: "Knowledge", href: `/dashboard/projects/${projectId}/knowledge` },
    { label: "Customize", href: `/dashboard/projects/${projectId}/customize` },
    { label: "Install", href: `/dashboard/projects/${projectId}/install` },
  ];
}

/** The project's sub-nav (tabs under its name), with the current section marked. */
export function ProjectNav({ projectId }: { projectId: string }) {
  return <ProjectNavLinks projectId={projectId} pathname={usePathname()} />;
}

/** The same tabs before the pathname is known (Suspense fallback): none marked. */
export function ProjectNavFallback({ projectId }: { projectId: string }) {
  return <ProjectNavLinks projectId={projectId} pathname={null} />;
}

/** The tabs for `pathname` (null: not known yet). */
export function ProjectNavLinks({ projectId, pathname }: { projectId: string; pathname: string | null }) {
  return (
    <nav aria-label="Project" className="min-w-0 overflow-x-auto">
      <ul className="flex justify-between border-b border-line sm:justify-start sm:gap-1">
        {projectSections(projectId).map((section) => {
          const active =
            pathname !== null && (pathname === section.href || pathname.startsWith(`${section.href}/`));
          return (
            <li key={section.href}>
              <Link
                href={section.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "-mb-px flex h-10 items-center whitespace-nowrap border-b-2 px-1.5 text-sm sm:px-3 outline-none transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-focus",
                  active
                    ? "border-primary font-medium text-fg"
                    : "border-transparent text-fg-muted hover:text-fg",
                )}
              >
                {section.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
