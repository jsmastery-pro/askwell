import { MAX_KNOWLEDGE_FILE_BYTES } from "@askwell/shared";
import Link from "next/link";
import { BrowserFrame } from "./BrowserFrame";
import { ChatTranscript } from "./ChatTranscript";
import { FONT_DISPLAY } from "./fonts";
import { Section } from "./Section";
import { BUTTON_GLASS, BUTTON_PRIMARY } from "./styles";

const MAX_FILE_MB = MAX_KNOWLEDGE_FILE_BYTES / (1024 * 1024);

export function Hero() {
  return (
    <Section className="grid grid-cols-1 items-center gap-14 pt-16 pb-24 sm:pt-24 lg:grid-cols-[1.05fr_1fr] lg:pt-28 lg:pb-32">
      <div>
        <h1
          className="max-w-xl text-[2.6rem] leading-[1.05] font-semibold tracking-[-0.03em] text-ink sm:text-6xl"
          style={FONT_DISPLAY}
        >
          A support agent that only says what your docs say.
        </h1>
        <p className="mt-6 max-w-md text-lg leading-relaxed text-muted">
          Paste your product docs or upload a PDF, drop in one script tag, and visitors get accurate answers day or
          night — no hallucinated features, no guessing.
        </p>
        <div className="mt-9 flex flex-wrap items-center gap-3">
          <Link href="/sign-up" className={BUTTON_PRIMARY}>
            Start free
          </Link>
          <a href="#how-it-works" className={BUTTON_GLASS}>
            See how it works
          </a>
        </div>
        <p className="mt-6 text-sm text-muted">Free to start. Live on your site in under five minutes.</p>
      </div>
      <BrowserFrame url="yoursite.com">
        <ChatTranscript
          title="Support"
          messages={[
            { from: "bot", text: "Hi, ask me anything about our product." },
            { from: "visitor", text: "Does it support PDF uploads?" },
            { from: "bot", text: `Yes — PDF, Markdown, or plain text, up to ${MAX_FILE_MB} MB per file.` },
          ]}
        />
      </BrowserFrame>
    </Section>
  );
}
