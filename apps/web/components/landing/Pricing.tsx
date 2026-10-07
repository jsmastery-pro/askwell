import { Container } from "../Container";

// TODO: swap this for `PLAN_LIMITS` from "@askwell/shared" once P1-T03 lands.
export const PRICING_ROWS = [
  { feature: "Projects", free: "1", pro: "5" },
  { feature: "Messages / month (per project)", free: "100", pro: "2,000" },
  { feature: "Knowledge files (per project)", free: "3", pro: "25" },
  { feature: "Button color", free: "Default", pro: "Any" },
  { feature: "Button position", free: "Bottom right", pro: "Any corner" },
  { feature: "Button label", free: "Default", pro: "Custom" },
  { feature: "Open animation", free: "Fade", pro: "Fade / slide / scale" },
  { feature: "Header text", free: "Default", pro: "Custom" },
  { feature: '"Powered by" badge', free: "Shown", pro: "Hidden" },
] as const;

export function Pricing() {
  return (
    <section id="pricing" className="border-t border-slate-800 py-24">
      <Container>
        <h2 className="text-center text-3xl font-bold">Pricing</h2>
        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2">
          {(["free", "pro"] as const).map((plan) => (
            <div
              key={plan}
              className="rounded-2xl border border-slate-700 bg-slate-900 p-6"
            >
              <h3 className="text-xl font-semibold capitalize">{plan}</h3>
              <dl className="mt-6 space-y-3 text-sm">
                {PRICING_ROWS.map((row) => (
                  <div key={row.feature} className="flex justify-between gap-4">
                    <dt className="text-slate-400">{row.feature}</dt>
                    <dd className="text-right font-medium">{row[plan]}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
