import Link from "next/link";
import { FONT_DISPLAY } from "./fonts";
import { Section } from "./Section";

// TODO: swap this for `PLAN_LIMITS` from "@askwell/shared" once P1-T03 lands.
export const PRICING_ROWS = [
  { group: "Usage", feature: "Projects", free: "1", pro: "5" },
  { group: "Usage", feature: "Messages / month (per project)", free: "100", pro: "2,000" },
  { group: "Usage", feature: "Knowledge files (per project)", free: "3", pro: "25" },
  { group: "Customization", feature: "Button color", free: "Default", pro: "Any" },
  { group: "Customization", feature: "Button position", free: "Bottom right", pro: "Any corner" },
  { group: "Customization", feature: "Button label", free: "Default", pro: "Custom" },
  { group: "Customization", feature: "Open animation", free: "Fade", pro: "Fade / slide / scale" },
  { group: "Customization", feature: "Header text", free: "Default", pro: "Custom" },
  { group: "Customization", feature: '"Powered by" badge', free: "Shown", pro: "Hidden" },
] as const;

const GROUPS = ["Usage", "Customization"] as const;

const PLANS = [
  { key: "free", name: "Free", caption: "Try it with one project.", highlight: false },
  { key: "pro", name: "Pro", caption: "Most teams pick this.", highlight: true },
] as const;

export function Pricing() {
  return (
    <section id="pricing" className="bg-[#EEF1F6] py-24">
      <Section>
        <div className="text-center">
          <h2 className="text-3xl font-semibold text-[#161A24]" style={FONT_DISPLAY}>
            Simple pricing. Upgrade when you outgrow Free.
          </h2>
        </div>
        <div className="mx-auto mt-16 grid max-w-3xl grid-cols-1 gap-6 sm:grid-cols-2">
          {PLANS.map((plan) => (
            <div
              key={plan.key}
              className={
                plan.highlight
                  ? "rounded-xl border border-[#F2A33C] bg-white p-8 shadow-xl shadow-black/5 ring-1 ring-[#F2A33C]"
                  : "rounded-xl border border-[#D7DCE6] bg-white p-8"
              }
            >
              <h3 className="text-xl font-semibold text-[#161A24]">{plan.name}</h3>
              <p className="mt-1 text-sm text-[#70788D]">{plan.caption}</p>
              <Link
                href="/sign-up"
                className={
                  plan.highlight
                    ? "mt-6 inline-block w-full rounded-md bg-[#F2A33C] px-4 py-2 text-center text-sm font-medium text-[#161A24] transition hover:bg-[#F5B35C]"
                    : "mt-6 inline-block w-full rounded-md border border-[#D7DCE6] px-4 py-2 text-center text-sm font-medium text-[#161A24] transition hover:border-[#9aa5b8]"
                }
              >
                Start free
              </Link>
              {plan.highlight && (
                <p className="mt-3 text-xs text-[#70788D]">
                  Upgrade to Pro from your dashboard once you&apos;re signed in.
                </p>
              )}
              <div className="mt-8 space-y-6">
                {GROUPS.map((group) => (
                  <div key={group}>
                    <p className="text-xs font-medium text-[#70788D]">{group}</p>
                    <dl className="mt-3 space-y-2 border-t border-[#EEF1F6] pt-3">
                      {PRICING_ROWS.filter((row) => row.group === group).map((row) => (
                        <div key={row.feature} className="flex justify-between gap-4 text-sm">
                          <dt className="text-[#70788D]">{row.feature}</dt>
                          <dd className="text-right font-medium text-[#161A24]">
                            {row[plan.key]}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>
    </section>
  );
}
