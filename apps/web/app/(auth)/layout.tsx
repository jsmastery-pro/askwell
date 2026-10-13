import type { ReactNode } from "react";
import Link from "next/link";
import { ClerkProvider } from "@clerk/nextjs";
import { APP_NAME } from "@askwell/shared";
import { Backdrop } from "../../components/landing/Backdrop";
import { FONT_BODY, FONT_DISPLAY, GOOGLE_FONTS_HREF } from "../../components/landing/fonts";
import { FOCUS_RING } from "../../components/landing/styles";

// Clerk's sign-in/up cards in the landing's dark monochrome look. Colours come from the tokens,
// which `.theme-dark` sets on the wrapper below.
const APPEARANCE = {
  variables: {
    colorPrimary: "var(--color-ink)",
    colorPrimaryForeground: "var(--color-inverse)",
    colorBackground: "var(--color-surface)",
    colorForeground: "var(--color-ink)",
    colorMutedForeground: "var(--color-muted)",
    colorInput: "var(--color-surface-strong)",
    colorInputForeground: "var(--color-ink)",
    colorNeutral: "var(--color-ink)",
    colorBorder: "var(--color-line-strong)",
    colorDanger: "var(--color-danger)",
    colorRing: "var(--color-focus)",
    fontFamily: "'IBM Plex Sans', sans-serif",
    borderRadius: "0.75rem",
  },
  elements: {
    cardBox: "glass shadow-none",
    card: "bg-transparent shadow-none",
    footer: "bg-transparent",
  },
};

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider appearance={APPEARANCE}>
      <div className="theme-dark relative isolate flex min-h-screen flex-col items-center overflow-clip bg-canvas px-4 text-ink" style={FONT_BODY}>
        <link rel="stylesheet" href={GOOGLE_FONTS_HREF} />
        <Backdrop />
        <Link href="/" className={`mt-10 mb-2 rounded-full text-xl font-semibold ${FOCUS_RING}`} style={FONT_DISPLAY}>
          {APP_NAME}
        </Link>
        {children}
      </div>
    </ClerkProvider>
  );
}
