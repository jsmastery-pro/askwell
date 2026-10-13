import { PLAN_LIMITS } from "@askwell/shared";
import Link from "next/link";
import type { ReactNode } from "react";
import { FONT_DISPLAY } from "../landing/fonts";
import { formatCount, formatDate } from "../project-shell/format";
import { UsageMeter } from "../project-shell/UsageMeter";
import { FOCUS } from "../projects/styles";
import { currentUsage, usageLevel } from "./level";

type Props = {
  used: number;
  limit: number;
  resetsAt: string;
  /** Render time, from the server, so the period check matches what the server saw. */
  now: string;
  /** Names the meter for screen readers, e.g. "Help center: messages used this month". */
  label: string;
  /** "large" for a project's Overview, "compact" for a row in a list. */
  size?: "large" | "compact";
  /** A heading or link shown on the left of the compact count line. */
  title?: ReactNode;
  /** Set on Free: the warnings then link to the upgrade. */
  upgradeHref?: string;
};

const NOTE = {
  warning: "border-[#F2A33C] bg-[#FEF6EA] text-[#7A4A06]",
  limit: "border-[#FDA29B] bg-[#FEF3F2] text-[#B42318]",
} as const;

/** Messages used this month against the plan limit, with the reset date and limit warnings. */
export function UsageSummary({ used: stored, limit, resetsAt, now, label, size = "compact", title, upgradeHref }: Props) {
  const { used, periodEnded } = currentUsage(stored, resetsAt, now);
  const level = usageLevel(used, limit);
  const percent = Math.min(Math.floor((used / limit) * 100), 100);
  const resetDate = formatDate(resetsAt);
  const upgrade = upgradeHref && (
    <>
      {" "}
      <Link href={upgradeHref} className={`font-medium underline underline-offset-4 ${FOCUS}`}>
        Upgrade to Pro
      </Link>{" "}
      for {formatCount(PLAN_LIMITS.pro.messagesPerMonth)} a month.
    </>
  );

  return (
    <div>
      {size === "large" ? (
        <p className="flex items-baseline gap-2 text-[#161A24]" style={FONT_DISPLAY}>
          <span className="text-5xl font-semibold tabular-nums">{formatCount(used)}</span>
          <span className="text-xl text-[#70788D]">of {formatCount(limit)} messages</span>
        </p>
      ) : (
        <div className="flex items-baseline justify-between gap-4">
          <div className="min-w-0">{title}</div>
          <p className="shrink-0 text-sm text-[#161A24] tabular-nums">
            {formatCount(used)} <span className="text-[#70788D]">/ {formatCount(limit)}</span>
          </p>
        </div>
      )}
      <div className={size === "large" ? "mt-4 max-w-xl" : "mt-2"}>
        <UsageMeter used={used} limit={limit} label={label} />
      </div>
      <p className="mt-2 text-sm text-[#70788D]">
        {periodEnded ? "A new month starts with the next message." : `Resets on ${resetDate}.`}
      </p>
      {level !== "ok" && (
        <p className={`mt-3 rounded-md border-l-4 px-3 py-2 text-sm ${NOTE[level]} ${size === "large" ? "max-w-xl" : ""}`}>
          {level === "limit" ? (
            <>
              <strong className="font-semibold">Limit reached.</strong> Until {resetDate}, visitors see a message
              that the chat limit is reached.
            </>
          ) : (
            <>
              <strong className="font-semibold">{percent}% used.</strong> At {formatCount(limit)}, the widget stops
              replying until {resetDate}.
            </>
          )}
          {upgrade}
        </p>
      )}
    </div>
  );
}
