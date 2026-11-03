import { Footer, Hero, HowItWorks, Install, LiveDemo, Pricing } from "../components/landing";

export default function Home() {
  return (
    <div data-surface="dark" className="relative isolate min-h-dvh overflow-x-clip">
      {/* Soft glows behind the glass so the blur shows. */}
      <div
        aria-hidden="true"
        className="absolute -top-40 left-1/2 -z-10 size-[36rem] -translate-x-1/2 rounded-full bg-glow blur-glow"
      />
      <div
        aria-hidden="true"
        className="absolute top-[110rem] -right-40 -z-10 size-96 rounded-full bg-glow blur-glow"
      />
      <main>
        <Hero />
        <HowItWorks />
        <LiveDemo />
        <Pricing />
        <Install />
      </main>
      <Footer />
    </div>
  );
}
