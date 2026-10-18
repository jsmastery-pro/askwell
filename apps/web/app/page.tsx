import { headers } from "next/headers";
import { Backdrop } from "../components/landing/Backdrop";
import { Footer } from "../components/landing/Footer";
import { FONT_BODY, GOOGLE_FONTS_HREF } from "../components/landing/fonts";
import { Hero } from "../components/landing/Hero";
import { HowItWorks } from "../components/landing/HowItWorks";
import { InstallSnippet } from "../components/landing/InstallSnippet";
import { LandingWidget } from "../components/landing/LandingWidget";
import { LiveDemo } from "../components/landing/LiveDemo";
import { Nav } from "../components/landing/Nav";
import { Pricing } from "../components/landing/Pricing";
import { landingWidgetKey } from "../components/landing/widget-key";
import { resolveAppUrl } from "../components/projects/snippet";

// Rendered per request: the widget key and the app URL are runtime env (InstaCloud has no build-time env).
export const dynamic = "force-dynamic";

export default async function Home() {
  const widgetKey = landingWidgetKey();
  const appUrl = resolveAppUrl(await headers());
  return (
    <main className="theme-dark relative isolate min-h-screen overflow-x-clip bg-canvas text-ink" style={FONT_BODY}>
      <link rel="stylesheet" href={GOOGLE_FONTS_HREF} />
      <Backdrop />
      <Nav />
      <Hero />
      <HowItWorks />
      <LiveDemo live={widgetKey !== null} />
      <Pricing />
      <InstallSnippet appUrl={appUrl} />
      <Footer />
      <LandingWidget publicKey={widgetKey} />
    </main>
  );
}
