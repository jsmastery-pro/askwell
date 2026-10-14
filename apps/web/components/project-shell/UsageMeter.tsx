// Quota bar: ink while there's room, the warning colour from 80%, red at the limit.
export function UsageMeter({ used, limit, label }: { used: number; limit: number; label: string }) {
  const ratio = limit > 0 ? Math.min(used / limit, 1) : 1;
  const fill = ratio >= 1 ? "bg-danger" : ratio >= 0.8 ? "bg-warning" : "bg-ink";
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={limit}
      aria-valuenow={Math.min(used, limit)}
      aria-valuetext={`${used} of ${limit}`}
      className="h-2 w-full overflow-hidden rounded-full bg-surface-strong"
    >
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${ratio * 100}%` }} />
    </div>
  );
}
