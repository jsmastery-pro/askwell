// "12 / 100 messages this month", a bar, and when the month resets
// (project.md §6.12, §13). Presentational only: the usage is computed on the
// server (lib/usage) from the plan read there. Works in server and client
// components; text renders as text.
import type { Usage } from "../../lib/usage/usage";
import { formatCreatedDate } from "../projects/format";
import { cx } from "../ui/cx";
import { AlertIcon } from "../ui/icons";

const count = (n: number) => n.toLocaleString("en-US");

export interface UsageMeterProps {
  usage: Usage;
  className?: string;
}

export function UsageMeter({ usage, className }: UsageMeterProps) {
  const { used, limit, resetsAt, atLimit } = usage;
  const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100;
  const label = `${count(used)} / ${count(limit)} messages this month`;

  return (
    <div className={cx("flex min-w-0 flex-col gap-1.5", className)} data-usage={atLimit ? "at-limit" : "ok"}>
      <p className="text-sm text-fg">
        <span className="font-medium tabular-nums">
          {count(used)} / {count(limit)}
        </span>{" "}
        <span className="text-fg-muted">messages this month</span>
      </p>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={used}
        className="h-1.5 w-full overflow-hidden rounded-full border border-line bg-hover"
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
      <p className="text-xs text-fg-muted">
        {resetsAt ? (
          <>
            Resets <time dateTime={resetsAt}>{formatCreatedDate(resetsAt)}</time>
          </>
        ) : (
          "A new month starts with the next message"
        )}
      </p>
      {atLimit ? (
        <p
          role="status"
          className="flex items-start gap-1.5 rounded-control border border-fg px-2.5 py-1.5 text-xs font-medium text-fg"
        >
          <AlertIcon aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          <span>Limit reached: the widget is showing visitors the quota message.</span>
        </p>
      ) : null}
    </div>
  );
}
