import { PLAN_PRICES, PLANS } from "@askwell/shared";
import { Button, GlassPanel } from "../ui";
import { cx } from "../ui/cx";
import { REVEAL } from "./motion";
import { PLAN_NAMES, PRICING_ROWS } from "./pricing-rows";
import { Section } from "./Section";

export function Pricing() {
  return (
    <Section
      id="pricing"
      eyebrow="Pricing"
      title="Start free. Upgrade when you grow."
      intro="Free covers one site. Pro adds more projects, more messages, and full control of how the chat looks."
    >
      <GlassPanel padding="none" className={cx("mx-auto w-full max-w-3xl overflow-hidden", REVEAL)}>
        <table className="w-full table-fixed border-collapse text-left text-sm">
          <caption className="sr-only">Plans compared</caption>
          <colgroup>
            <col className="w-[44%]" />
            <col />
            <col />
          </colgroup>
          <thead>
            <tr className="border-b border-line">
              <td className="p-4 sm:p-6" />
              {PLANS.map((plan) => (
                <th key={plan} scope="col" className="p-4 align-bottom font-normal sm:p-6">
                  <span className="block text-sm font-medium text-fg-muted">{PLAN_NAMES[plan]}</span>
                  <span className="mt-1 block" data-price={plan}>
                    <span className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
                      ${PLAN_PRICES[plan].usdPerMonth}
                    </span>
                    <span className="block text-fg-subtle sm:inline">/month</span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PRICING_ROWS.map((row) => (
              <tr key={row.label} className="border-b border-line last:border-b-0">
                <th scope="row" className="p-4 font-normal text-fg-muted sm:px-6">
                  {row.label}
                </th>
                {PLANS.map((plan) => (
                  <td key={plan} className="p-4 sm:px-6">
                    {row.values[plan]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </GlassPanel>

      <div className={cx("mt-8 flex justify-center", REVEAL)}>
        <Button href="/sign-up" size="lg">
          Start free
        </Button>
      </div>
    </Section>
  );
}
