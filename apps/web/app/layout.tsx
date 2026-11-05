import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Geist, Geist_Mono } from "next/font/google";
import { APP_NAME } from "@askwell/shared";
import { PostHogIdentify } from "@/components/analytics/PostHogIdentify";
import {
  AFTER_AUTH_PATH,
  AFTER_SIGN_OUT_PATH,
  SIGN_IN_PATH,
  SIGN_UP_PATH,
} from "@/lib/auth/routes";
import { themeScript } from "@/lib/theme/theme";
import "./globals.css";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: APP_NAME,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The theme script sets data-theme on <html> before React hydrates, so the
    // attributes differ from the server render on purpose.
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        {/* Light / dark before the first paint (lib/theme). A fixed string we
            build ourselves: no user input reaches it. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript() }} />
      </head>
      <body>
        {/* Clerk's default appearance (§13), which follows the page's
            color-scheme: dark in the dark theme. Redirects live here, not in env. */}
        <ClerkProvider
          signInUrl={SIGN_IN_PATH}
          signUpUrl={SIGN_UP_PATH}
          signInFallbackRedirectUrl={AFTER_AUTH_PATH}
          signUpFallbackRedirectUrl={AFTER_AUTH_PATH}
          afterSignOutUrl={AFTER_SIGN_OUT_PATH}
        >
          <PostHogIdentify />
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
