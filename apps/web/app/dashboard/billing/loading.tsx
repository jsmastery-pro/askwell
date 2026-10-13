// Shown while the plan and usage load.
export default function BillingLoading() {
  return (
    <div aria-busy="true" aria-label="Loading billing" className="animate-pulse space-y-12 motion-reduce:animate-none">
      <div className="h-9 w-40 rounded-md bg-[#DDE2EA]" />
      <div className="h-44 rounded-xl bg-[#DDE2EA]" />
      <div className="h-40 rounded-xl bg-[#DDE2EA]" />
    </div>
  );
}
