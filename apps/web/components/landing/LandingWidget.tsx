import Script from "next/script";

/** Askwell's own chat widget, loaded the same way a customer's site loads it. */
export function LandingWidget({ publicKey }: { publicKey: string | null }) {
  if (!publicKey) return null;
  return <Script src="/widget.js" data-key={publicKey} strategy="afterInteractive" />;
}
