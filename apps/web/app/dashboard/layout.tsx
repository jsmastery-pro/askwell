import type { ReactNode } from "react";
import Link from "next/link";
import { ClerkProvider, SignOutButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { APP_NAME } from "@askwell/shared";
import { FONT_BODY, FONT_DISPLAY, GOOGLE_FONTS_HREF } from "../../components/landing/fonts";
import { ensureAccount } from "./account";

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F2A33C]";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { userId } = await auth.protect();
  await ensureAccount(userId);

  return (
    <ClerkProvider>
      <div className="flex min-h-screen flex-col bg-[#EEF1F6] md:flex-row" style={FONT_BODY}>
        <link rel="stylesheet" href={GOOGLE_FONTS_HREF} />
        <aside className="flex items-center justify-between gap-4 bg-[#10131D] px-6 py-4 md:w-60 md:flex-col md:items-stretch md:justify-start md:py-8">
          <Link
            href="/dashboard"
            className={`text-lg font-semibold text-white ${FOCUS}`}
            style={FONT_DISPLAY}
          >
            {APP_NAME}
          </Link>
          <nav aria-label="Dashboard" className="md:mt-10 md:flex-1">
            <Link
              href="/dashboard"
              aria-current="page"
              className={`block rounded-md bg-white/10 px-3 py-2 text-sm font-medium text-white ${FOCUS}`}
            >
              Overview
            </Link>
          </nav>
          <SignOutButton redirectUrl="/sign-in">
            <button
              type="button"
              className={`rounded-md px-3 py-2 text-left text-sm text-[#C3C9D6] hover:bg-white/5 hover:text-white ${FOCUS}`}
            >
              Sign out
            </button>
          </SignOutButton>
        </aside>
        <main className="flex-1 px-6 py-10 md:px-12 md:py-14">{children}</main>
      </div>
    </ClerkProvider>
  );
}
