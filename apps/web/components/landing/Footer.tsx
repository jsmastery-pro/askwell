import Link from "next/link";
import { APP_NAME } from "@askwell/shared";

const links = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#pricing", label: "Pricing" },
  { href: "/sign-in", label: "Sign in" },
  { href: "/sign-up", label: "Start free" },
];

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-sm text-fg-muted">
          <span className="font-semibold text-fg">{APP_NAME}</span> · AI support chat for any website
        </p>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-fg-muted">
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="rounded-sm outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-focus">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
