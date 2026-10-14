import type { ReactNode } from "react";
import { FONT_DISPLAY } from "../landing/fonts";
import { formatCount } from "../project-shell/format";
import { GLASS_CARD } from "../ui/styles";
import { describeChange } from "./change";

const TONE = {
  up: "text-success",
  down: "text-danger",
  flat: "text-muted",
  new: "text-ink",
} as const;

type Props = {
  label: string;
  value: ReactNode;
  /** Set to show the change against the previous period. */
  change?: { current: number; previous: number; period: string };
  badge?: ReactNode;
  footer?: ReactNode;
};

export function StatCard({ label, value, change, badge, footer }: Props) {
  const delta = change && describeChange(change.current, change.previous);
  return (
    <div className={`flex min-w-0 flex-col p-4 sm:p-5 ${GLASS_CARD}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm text-muted">{label}</h3>
        {badge}
      </div>
      <p className="mt-2 text-3xl font-semibold text-ink tabular-nums" style={FONT_DISPLAY}>
        {typeof value === "number" ? formatCount(value) : value}
      </p>
      {change && (
        <p className="mt-1 text-xs text-muted">
          {delta ? (
            <>
              <span className={`font-semibold ${TONE[delta.direction]}`}>{delta.label}</span> vs previous {change.period}
            </>
          ) : (
            "None yet"
          )}
        </p>
      )}
      {footer && <div className="mt-auto pt-2 text-xs">{footer}</div>}
    </div>
  );
}
