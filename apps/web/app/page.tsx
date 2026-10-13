import { Backdrop } from "../components/landing/Backdrop";
import { Footer } from "../components/landing/Footer";
import { FONT_BODY, GOOGLE_FONTS_HREF } from "../components/landing/fonts";
import { Hero } from "../components/landing/Hero";
import { HowItWorks } from "../components/landing/HowItWorks";
import { InstallSnippet } from "../components/landing/InstallSnippet";
import { LiveDemoPlaceholder } from "../components/landing/LiveDemoPlaceholder";
import { Nav } from "../components/landing/Nav";
import { Pricing } from "../components/landing/Pricing";

export default function Home() {
  return (
    <main className="theme-dark relative isolate min-h-screen overflow-x-clip bg-canvas text-ink" style={FONT_BODY}>
      <link rel="stylesheet" href={GOOGLE_FONTS_HREF} />
      <Backdrop />
      <Nav />
      <Hero />
      <HowItWorks />
      <LiveDemoPlaceholder />
      <Pricing />
      <InstallSnippet />
      <Footer />
    </main>
  );
}
