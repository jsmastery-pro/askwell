import { Hero } from "../components/landing/Hero";
import { HowItWorks } from "../components/landing/HowItWorks";
import { LiveDemoPlaceholder } from "../components/landing/LiveDemoPlaceholder";
import { Pricing } from "../components/landing/Pricing";
import { InstallSnippet } from "../components/landing/InstallSnippet";
import { Footer } from "../components/landing/Footer";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <Hero />
      <HowItWorks />
      <LiveDemoPlaceholder />
      <Pricing />
      <InstallSnippet />
      <Footer />
    </main>
  );
}
