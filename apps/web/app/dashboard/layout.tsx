import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { DASHBOARD_FRAME, NavBar } from "../../components/dashboard-nav/NavBar";
import { FONT_BODY, GOOGLE_FONTS_HREF } from "../../components/landing/fonts";
import { ensureAccount } from "./account";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { userId } = await auth.protect();
  await ensureAccount(userId);

  return (
    <ClerkProvider>
      <div className="min-h-screen bg-[#EEF1F6]" style={FONT_BODY}>
        <link rel="stylesheet" href={GOOGLE_FONTS_HREF} />
        <NavBar />
        <main className={`py-10 md:py-14 ${DASHBOARD_FRAME}`}>{children}</main>
      </div>
    </ClerkProvider>
  );
}
