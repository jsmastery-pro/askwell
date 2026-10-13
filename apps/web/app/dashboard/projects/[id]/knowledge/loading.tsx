// Shown while the Knowledge tab's server data loads.
export default function KnowledgeLoading() {
  return (
    <div role="status" aria-label="Loading knowledge" className="space-y-8 motion-safe:animate-pulse">
      <div className="space-y-3">
        <div className="h-6 w-36 rounded bg-[#DDE2EA]" />
        <div className="h-4 w-80 max-w-full rounded bg-[#E5E9F0]" />
      </div>
      <div className="h-2 w-full max-w-md rounded-full bg-[#DDE2EA]" />
      <div className="grid gap-4 md:grid-cols-[1.3fr_1fr]">
        <div className="h-36 rounded-xl bg-[#E5E9F0]" />
        <div className="h-36 rounded-xl bg-[#E5E9F0]" />
      </div>
      <div className="space-y-3">
        {[0, 1, 2].map((row) => (
          <div key={row} className="h-14 rounded bg-[#E5E9F0]" />
        ))}
      </div>
    </div>
  );
}
