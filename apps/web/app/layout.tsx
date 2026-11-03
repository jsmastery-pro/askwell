import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Geist, Geist_Mono } from "next/font/google";
import { APP_NAME } from "@askwell/shared";
import {
  AFTER_AUTH_PATH,
  AFTER_SIGN_OUT_PATH,
  SIGN_IN_PATH,
  SIGN_UP_PATH,
} from "@/lib/auth/routes";
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
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        {/* Clerk's default appearance (§13). Redirects live here, not in env. */}
        <ClerkProvider
          signInUrl={SIGN_IN_PATH}
          signUpUrl={SIGN_UP_PATH}
          signInFallbackRedirectUrl={AFTER_AUTH_PATH}
          signUpFallbackRedirectUrl={AFTER_AUTH_PATH}
          afterSignOutUrl={AFTER_SIGN_OUT_PATH}
        >
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
