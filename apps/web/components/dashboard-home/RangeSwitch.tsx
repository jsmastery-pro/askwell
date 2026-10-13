import Link from "next/link";
import { FOCUS } from "../ui/styles";

const OPTIONS = [
  { range: "7d", name: "Last 7 days" },
  { range: "30d", name: "Last 30 days" },
  { range: "90d", name: "Last 90 days" },
] as const;

/** Links, not client state: the range lives in the URL and the page renders on the server. */
export function RangeSwitch({ current }: { current: string }) {
  return (
    <div role="group" aria-label="Time range" className="inline-flex rounded-lg border border-[#D7DCE6] bg-white p-1">
      {OPTIONS.map((option) => {
        const active = option.range === current;
        return (
          <Link
            key={option.range}
            href={`?range=${option.range}`}
            scroll={false}
            aria-current={active ? "true" : undefined}
            title={option.name}
            className={`rounded-md px-3 py-1.5 text-sm font-medium tabular-nums ${
              active ? "bg-[#10131D] text-white" : "text-[#4A5163] hover:bg-[#F5F7FA] hover:text-[#161A24]"
            } ${FOCUS}`}
          >
            {option.range}
          </Link>
        );
      })}
    </div>
  );
}
