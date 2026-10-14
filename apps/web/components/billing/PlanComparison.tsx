import type { Plan } from "@askwell/shared";
import { PRICING_ROWS } from "../landing/Pricing";

const PLANS = [
  { key: "free", name: "Free" },
  { key: "pro", name: "Pro" },
] as const;

const GROUPS = ["Usage", "Customization"] as const;

/** Free vs. Pro, with the same rows and numbers as the landing page's pricing. */
export function PlanComparison({ plan }: { plan: Plan }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <table className="w-full table-fixed text-left text-sm">
        <caption className="sr-only">Free and Pro plans compared</caption>
        <colgroup>
          <col className="w-[46%] sm:w-1/2" />
          <col />
          <col />
        </colgroup>
        <thead>
          <tr className="border-b border-line">
            <td className="px-4 py-3 sm:px-5" />
            {PLANS.map((p) => (
              <th
                key={p.key}
                scope="col"
                aria-current={p.key === plan ? "true" : undefined}
                className={`px-3 py-3 align-bottom font-semibold text-ink sm:px-5 ${p.key === plan ? "bg-canvas" : ""}`}
              >
                {p.name}
                {p.key === plan && <span className="block text-xs font-normal text-muted">Your plan</span>}
              </th>
            ))}
          </tr>
        </thead>
        {GROUPS.map((group) => (
          <tbody key={group}>
            <tr>
              <th scope="colgroup" colSpan={3} className="bg-canvas px-4 py-2 text-xs font-medium text-muted sm:px-5">
                {group}
              </th>
            </tr>
            {PRICING_ROWS.filter((row) => row.group === group).map((row) => (
              <tr key={row.feature} className="border-t border-line">
                <th scope="row" className="px-4 py-2.5 font-normal text-muted sm:px-5">
                  {row.feature}
                </th>
                {PLANS.map((p) => (
                  <td
                    key={p.key}
                    className={`px-3 py-2.5 text-ink tabular-nums sm:px-5 ${p.key === plan ? "bg-canvas" : ""}`}
                  >
                    {row[p.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}
