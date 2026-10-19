import { APP_NAME } from "@askwell/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { Backdrop } from "../components/landing/Backdrop";
import { FONT_BODY, FONT_DISPLAY, GOOGLE_FONTS_HREF } from "../components/landing/fonts";
import { BUTTON_PRIMARY } from "../components/landing/styles";

export const metadata: Metadata = { title: `Page not found · ${APP_NAME}` };

// Any unknown URL outside the dashboard, in the landing's look. The dashboard has its own.
export default function NotFound() {
  return (
    <main
      className="theme-dark relative isolate flex min-h-dvh items-center justify-center overflow-hidden bg-canvas px-6 text-center text-ink"
      style={FONT_BODY}
    >
      <link rel="stylesheet" href={GOOGLE_FONTS_HREF} />
      {/* Sized for the long landing page: overflow-hidden keeps it inside this one screen. */}
      <Backdrop />
      <div className="max-w-md">
        <p className="text-sm font-medium text-muted">404</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.02em] sm:text-4xl" style={FONT_DISPLAY}>
          This page doesn&apos;t exist.
        </h1>
        <p className="mt-4 text-muted">The link may be broken, or the page may have moved.</p>
        <Link href="/" className={`mt-8 ${BUTTON_PRIMARY}`}>
          Back to {APP_NAME}
        </Link>
      </div>
    </main>
  );
}
