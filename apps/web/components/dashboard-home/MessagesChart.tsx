import { formatCount } from "../project-shell/format";

type Day = { day: string; messages: number };

const dayLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const label = (day: string) => dayLabel.format(new Date(`${day}T00:00:00.000Z`));

/** "1,284 messages, busiest day Oct 9: 96". Also the chart's text alternative. */
export function chartSummary(days: Day[]): string {
  const total = days.reduce((sum, d) => sum + d.messages, 0);
  const busiest = days.reduce((top, d) => (d.messages > top.messages ? d : top), days[0]!);
  return `${formatCount(total)} ${total === 1 ? "message" : "messages"}, busiest day ${label(busiest.day)}: ${formatCount(busiest.messages)}`;
}

/** One bar per day in gray; the busiest day in black. Inline SVG, scaled to the container's width. */
export function MessagesChart({ days }: { days: Day[] }) {
  const max = Math.max(...days.map((d) => d.messages), 1);
  const busiest = days.findIndex((d) => d.messages === max);
  const slot = 10;
  const gap = days.length > 40 ? 2 : 3;
  const summary = chartSummary(days);

  return (
    <figure>
      <div className="flex items-stretch gap-3">
        <div aria-hidden="true" className="flex flex-col justify-between py-0.5 text-right text-xs text-muted tabular-nums">
          <span>{formatCount(max)}</span>
          <span>0</span>
        </div>
        <svg
          role="img"
          aria-label={`Messages per day: ${summary}`}
          viewBox={`0 0 ${days.length * slot} 100`}
          preserveAspectRatio="none"
          className="h-44 w-full min-w-0 border-b border-line-strong"
        >
          {days.map((d, i) => {
            const height = (d.messages / max) * 96;
            return (
              <rect
                key={d.day}
                x={i * slot + gap / 2}
                y={100 - height}
                width={slot - gap}
                height={height}
                rx={1}
                className={i === busiest && d.messages > 0 ? "fill-ink" : "fill-muted"}
              >
                <title>{`${label(d.day)}: ${formatCount(d.messages)}`}</title>
              </rect>
            );
          })}
        </svg>
      </div>
      <div aria-hidden="true" className="mt-2 flex justify-between pl-9 text-xs text-muted">
        <span>{label(days[0]!.day)}</span>
        <span>{label(days[days.length - 1]!.day)}</span>
      </div>
      <figcaption className="mt-3 text-sm text-muted">{summary}.</figcaption>
    </figure>
  );
}
