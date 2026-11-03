import type { CSSProperties } from "react";
import { APP_NAME } from "@askwell/shared";
import { Button } from "../ui";
import { cx } from "../ui/cx";
import { ENTER } from "./motion";

const delay = (ms: number) => ({ "--delay": `${ms}ms` }) as CSSProperties;

export function Hero() {
  return (
    <section id="hero" aria-labelledby="hero-title" className="relative">
      <nav
        aria-label="Main"
        className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5 sm:px-6"
      >
        <span className="text-lg font-semibold tracking-tight">{APP_NAME}</span>
        <div className="flex items-center gap-2">
          <Button href="/sign-in" variant="ghost" size="sm">
            Sign in
          </Button>
          <Button href="/sign-up" size="sm">
            Start free
          </Button>
        </div>
      </nav>

      <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-4 pt-16 pb-20 text-center sm:px-6 sm:pt-24 sm:pb-28">
        <p
          className={cx(
            "rounded-full border border-line bg-glass px-3 py-1 text-xs text-fg-muted backdrop-blur-glass-sm",
            ENTER,
          )}
        >
          AI support chat for any website
        </p>
        <h1
          id="hero-title"
          className={cx(
            "text-4xl font-semibold tracking-tight text-balance sm:text-6xl",
            ENTER,
          )}
          style={delay(80)}
        >
          Answer every visitor, straight from your own docs
        </h1>
        <p
          className={cx("max-w-xl text-base text-pretty text-fg-muted sm:text-lg", ENTER)}
          style={delay(160)}
        >
          {APP_NAME} reads your docs and adds a chat to your site. Visitors get answers any time of
          day, and you read every conversation.
        </p>
        <div
          className={cx("flex flex-wrap items-center justify-center gap-3", ENTER)}
          style={delay(240)}
        >
          <Button href="/sign-up" size="lg">
            Start free
          </Button>
          <Button href="#pricing" variant="secondary" size="lg">
            See pricing
          </Button>
        </div>
      </div>
    </section>
  );
}
