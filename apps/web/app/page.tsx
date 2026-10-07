import { Nav } from "../components/landing/Nav";
import { Hero } from "../components/landing/Hero";
import { HowItWorks } from "../components/landing/HowItWorks";
import { LiveDemoPlaceholder } from "../components/landing/LiveDemoPlaceholder";
import { Pricing } from "../components/landing/Pricing";
import { InstallSnippet } from "../components/landing/InstallSnippet";
import { Footer } from "../components/landing/Footer";
import { FONT_BODY, GOOGLE_FONTS_HREF } from "../components/landing/fonts";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#10131D]" style={FONT_BODY}>
      <link rel="stylesheet" href={GOOGLE_FONTS_HREF} />
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
