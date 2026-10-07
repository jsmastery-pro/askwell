import Link from "next/link";
import { BrowserFrame } from "./BrowserFrame";
import { ChatTranscript } from "./ChatTranscript";
import { FONT_DISPLAY } from "./fonts";
import { Section } from "./Section";

export function Hero() {
  return (
    <Section className="grid grid-cols-1 items-center gap-16 py-20 lg:grid-cols-[1.05fr_1fr] lg:py-28">
      <div>
        <h1
          className="max-w-xl text-4xl font-semibold leading-[1.1] text-white sm:text-5xl"
          style={FONT_DISPLAY}
        >
          A support agent that only says what your docs say.
        </h1>
        <p className="mt-6 max-w-md text-lg leading-relaxed text-[#C3C9D6]">
          Paste your product docs or upload a PDF, drop in one script tag, and visitors get
          accurate answers day or night — no hallucinated features, no guessing.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Link
            href="/sign-up"
            className="rounded-md bg-[#F2A33C] px-6 py-3 font-medium text-[#161A24] transition hover:bg-[#F5B35C]"
          >
            Start free
          </Link>
          <a
            href="#how-it-works"
            className="rounded-md border border-white/15 px-6 py-3 font-medium text-white transition hover:border-white/40"
          >
            See how it works
          </a>
        </div>
        <p className="mt-6 text-sm text-[#70788D]">
          Free to start. Live on your site in under five minutes.
        </p>
      </div>
      <BrowserFrame url="yoursite.com">
        <ChatTranscript
          title="Support"
          messages={[
            { from: "bot", text: "Hi, ask me anything about our product." },
            { from: "visitor", text: "Does it support PDF uploads?" },
            {
              from: "bot",
              text: "Yes — PDF, Markdown, or plain text, up to 10 MB per file.",
            },
          ]}
        />
      </BrowserFrame>
    </Section>
  );
}
