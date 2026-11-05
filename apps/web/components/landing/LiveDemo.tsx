import { Suspense } from "react";
import { headers } from "next/headers";
import { connection } from "next/server";
import { APP_NAME, DEFAULT_WIDGET_CONFIG } from "@askwell/shared";
import { requestOrigin, resolveAppUrl } from "../../lib/install/snippet";
import { getPublicWidgetConfig } from "../../lib/widget/config";
import { GlassPanel } from "../ui";
import { cx } from "../ui/cx";
import { landingWidgetKey } from "./landing-widget";
import { REVEAL } from "./motion";
import { Section } from "./Section";

// The Live demo section (§6.1). With LANDING_WIDGET_KEY set, the page loads
// the real widget (the house project about Askwell) and this section points
// at it. Without a key (local dev, an unset environment) it shows a static
// mock and no widget loads. Only this section reads the key, so the rest of
// the page stays in the static shell.

export function LiveDemo() {
  return (
    <Suspense fallback={<MockDemo />}>
      <LandingDemo />
    </Suspense>
  );
}

/**
 * The request-time part: reads the key, then shows the real widget or the
 * mock. A key that doesn't resolve to a project here (another environment's,
 * or a deleted project's) keeps the mock: the loader would get no config and
 * show nothing.
 */
export async function LandingDemo() {
  await connection();
  const key = landingWidgetKey();
  if (!key) return <MockDemo />;
  const config = await getPublicWidgetConfig(key).catch((error: unknown) => {
    console.error("Couldn't load the landing widget's config", error);
    return null;
  });
  if (!config) return <MockDemo />;
  const appUrl = resolveAppUrl(process.env.NEXT_PUBLIC_APP_URL, requestOrigin(await headers()));
  return <RealDemo appUrl={appUrl} publicKey={key} />;
}

const SUGGESTED_QUESTIONS = [
  `What is ${APP_NAME}?`,
  "How much is Pro?",
  "How do I add it to my site?",
] as const;

function RealDemo({ appUrl, publicKey }: { appUrl: string; publicKey: string }) {
  return (
    <Section
      id="demo"
      eyebrow="Live demo"
      title="See it answer"
      intro={`This page runs ${APP_NAME} on itself. The bot answers from a few pages of facts about the product.`}
    >
      {/* The same tag as the Install snippet (lib/install/snippet.ts). */}
      <script src={`${appUrl}/widget.js`} data-key={publicKey} async />
      <GlassPanel
        variant="strong"
        className={cx("mx-auto flex w-full max-w-md flex-col gap-4 text-center", REVEAL)}
      >
        <p className="text-base font-medium text-fg">
          Try it: the button in the corner is the real widget.
        </p>
        <p className="text-sm text-fg-muted">Open it and ask anything about {APP_NAME}, for example:</p>
        <ul className="flex flex-wrap justify-center gap-2" aria-label="Questions to try">
          {SUGGESTED_QUESTIONS.map((q) => (
            <li
              key={q}
              className="rounded-full border border-line bg-glass px-3 py-1 text-sm text-fg-muted"
            >
              {q}
            </li>
          ))}
        </ul>
      </GlassPanel>
    </Section>
  );
}

const sample = [
  { role: "visitor", text: "Do you ship to Canada?" },
  {
    role: "bot",
    text: "Yes. Orders to Canada ship in 3–5 business days, and shipping is free over $50.",
  },
  { role: "visitor", text: "Can I return a gift?" },
  {
    role: "bot",
    text: "You can return any unused item within 30 days. Gift returns get store credit.",
  },
] as const;

/** A static mock of the chat panel, for when no landing widget is configured. */
function MockDemo() {
  return (
    <Section
      id="demo"
      eyebrow="Live demo"
      title="See it answer"
      intro="A sample chat for an online store. The bot replies from the store's own shipping and returns pages."
    >
      <div className={cx("mx-auto flex w-full max-w-md flex-col items-end gap-4", REVEAL)}>
        <GlassPanel
          role="figure"
          variant="strong"
          padding="none"
          className="flex w-full flex-col overflow-hidden"
          aria-label="Preview of the chat panel"
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-sm font-medium">{DEFAULT_WIDGET_CONFIG.header_text}</p>
            <span className="rounded-full border border-line px-2 py-0.5 text-xs text-fg-subtle">
              Preview
            </span>
          </div>

          <ul className="flex flex-col gap-3 px-4 py-5" aria-label="Sample conversation">
            {sample.map((m, i) => (
              <li
                key={i}
                className={cx(
                  "max-w-[85%] rounded-control px-3 py-2 text-sm",
                  m.role === "visitor"
                    ? "self-end bg-primary text-primary-fg"
                    : "self-start border border-line bg-glass text-fg",
                )}
              >
                <span className="sr-only">{m.role === "visitor" ? "Visitor: " : "Bot: "}</span>
                {m.text}
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-2 border-t border-line px-4 py-3">
            <div
              aria-hidden="true"
              className="rounded-control border border-line px-3 py-2 text-sm text-fg-subtle"
            >
              Type a message…
            </div>
            <p className="text-center text-xs text-fg-subtle">Powered by {APP_NAME}</p>
          </div>
        </GlassPanel>

        <span
          aria-hidden="true"
          className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-fg shadow-glass"
        >
          {DEFAULT_WIDGET_CONFIG.label}
        </span>
      </div>
    </Section>
  );
}
