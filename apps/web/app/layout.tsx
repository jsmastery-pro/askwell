import type { Metadata } from "next";
import type { ReactNode } from "react";
import { APP_NAME } from "@askwell/shared";
import "./globals.css";

export const metadata: Metadata = {
  title: APP_NAME,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* The pages load Sora and IBM Plex from Google Fonts; connect early so the headline paints sooner. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      </head>
      <body>{children}</body>
    </html>
  );
}
