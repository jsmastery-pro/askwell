// Marks sections whose data is fake until its backend lands (docs/ui-track.md).
export function DemoBadge() {
  return (
    <span
      title="This section shows sample data until the feature is connected."
      className="rounded-full border border-dashed border-[#CBD2DE] px-2 py-0.5 text-xs font-medium text-[#70788D]"
    >
      Demo data
    </span>
  );
}
