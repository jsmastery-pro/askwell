import Link from "next/link";
import { PLAN_LIMITS, type Plan } from "@askwell/shared";
import { FONT_DISPLAY } from "./fonts";
import { Reveal } from "./Reveal";
import { Section } from "./Section";
import { BUTTON_GLASS, BUTTON_PRIMARY, CARD } from "./styles";

export const formatLimit = (n: number) => n.toLocaleString("en-US");

type NumericLimit = "projects" | "messagesPerMonth" | "knowledgeFilesPerProject";

const limitRow = (feature: string, key: NumericLimit) => {
  const value = (plan: Plan) => formatLimit(PLAN_LIMITS[plan][key]);
  return { group: "Usage", feature, free: value("free"), pro: value("pro") };
};

export const PRICING_ROWS = [
  limitRow("Projects", "projects"),
  limitRow("Messages / month (per project)", "messagesPerMonth"),
  limitRow("Knowledge files (per project)", "knowledgeFilesPerProject"),
  { group: "Customization", feature: "Button color", free: "Default", pro: "Any" },
  { group: "Customization", feature: "Button position", free: "Bottom right", pro: "Any corner" },
  { group: "Customization", feature: "Button label", free: "Default", pro: "Custom" },
  { group: "Customization", feature: "Open animation", free: "Fade", pro: "Fade / slide / scale" },
  { group: "Customization", feature: "Header text", free: "Default", pro: "Custom" },
  { group: "Customization", feature: '"Powered by" badge', free: "Shown", pro: "Hidden" },
];

const GROUPS = ["Usage", "Customization"] as const;

const PLANS = [
  { key: "free", name: "Free", caption: "Try it with one project.", highlight: false },
  { key: "pro", name: "Pro", caption: "Most teams pick this.", highlight: true },
] as const;

export function Pricing() {
  return (
    <section id="pricing" className="scroll-mt-24 py-24 sm:py-28">
      <Section>
        <Reveal className="text-center">
          <h2 className="text-3xl font-semibold tracking-[-0.02em] text-ink sm:text-4xl" style={FONT_DISPLAY}>
            Simple pricing. Upgrade when you outgrow Free.
          </h2>
        </Reveal>
        <div className="mx-auto mt-14 grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
          {PLANS.map((plan, index) => (
            <Reveal
              key={plan.key}
              delay={index * 120}
              className={`${CARD} p-7 sm:p-8 ${plan.highlight ? "border-line-strong ring-1 ring-line-strong" : ""}`}
            >
              <h3 className="text-xl font-semibold text-ink">{plan.name}</h3>
              <p className="mt-1 text-sm text-muted">{plan.caption}</p>
              <Link href="/sign-up" className={`mt-6 w-full py-2.5 text-sm ${plan.highlight ? BUTTON_PRIMARY : BUTTON_GLASS}`}>
                Start free
              </Link>
              {plan.highlight && (
                <p className="mt-3 text-xs text-muted">Upgrade to Pro from your dashboard once you&apos;re signed in.</p>
              )}
              <div className="mt-8 space-y-6">
                {GROUPS.map((group) => (
                  <div key={group}>
                    <p className="text-xs font-medium text-muted">{group}</p>
                    <dl className="mt-3 space-y-2 border-t border-line pt-3">
                      {PRICING_ROWS.filter((row) => row.group === group).map((row) => (
                        <div key={row.feature} className="flex justify-between gap-4 text-sm">
                          <dt className="text-muted">{row.feature}</dt>
                          <dd className="text-right font-medium text-ink">{row[plan.key]}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
              </div>
            </Reveal>
          ))}
        </div>
      </Section>
    </section>
  );
}
