import { PLAN_LIMITS } from "@askwell/shared";
import { BrowserFrame } from "./BrowserFrame";
import { ChatTranscript } from "./ChatTranscript";
import { FONT_DISPLAY } from "./fonts";
import { formatLimit } from "./Pricing";
import { Section } from "./Section";

export function LiveDemoPlaceholder() {
  return (
    <section className="bg-[#EEF1F6] py-24">
      <Section className="grid grid-cols-1 items-center gap-16 lg:grid-cols-[1fr_1.05fr]">
        <BrowserFrame url="acme.com">
          <ChatTranscript
            title="Acme Analytics"
            messages={[
              { from: "bot", text: "Hi! Ask me anything about Acme Analytics." },
              { from: "visitor", text: "What's the difference between Free and Pro?" },
              {
                from: "bot",
                text: `Free includes ${PLAN_LIMITS.free.projects} project and ${formatLimit(PLAN_LIMITS.free.messagesPerMonth)} messages a month. Pro includes ${PLAN_LIMITS.pro.projects} projects, ${formatLimit(PLAN_LIMITS.pro.messagesPerMonth)} messages, and full widget customization.`,
              },
              { from: "visitor", text: "Can I use my own domain for checkout?" },
              {
                from: "bot",
                text: "I don't know — that's outside what's in my docs. You can ask the Acme team directly.",
              },
            ]}
          />
        </BrowserFrame>
        <div>
          <h2 className="text-3xl font-semibold text-[#161A24]" style={FONT_DISPLAY}>
            See it answer a real question.
          </h2>
          <p className="mt-4 max-w-md text-[#70788D]">
            This is the exact widget your visitors will use — opened here so you can see the full
            exchange, including what happens when the answer isn&apos;t in your docs.
          </p>
          <ul className="mt-8 space-y-4">
            <li className="border-l-2 border-[#F2A33C] pl-4 text-sm text-[#161A24]">
              Scoped to one project&apos;s content only.
            </li>
            <li className="border-l-2 border-[#F2A33C] pl-4 text-sm text-[#161A24]">
              Answers &quot;I don&apos;t know&quot; instead of guessing.
            </li>
          </ul>
        </div>
      </Section>
    </section>
  );
}
