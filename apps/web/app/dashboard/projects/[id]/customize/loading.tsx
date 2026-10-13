// Shown while the Customize tab's config and plan load.
export default function CustomizeLoading() {
  return (
    <div role="status" aria-label="Loading customize" className="space-y-6 motion-safe:animate-pulse">
      <div className="space-y-3">
        <div className="h-6 w-36 rounded bg-[#DDE2EA]" />
        <div className="h-4 w-80 max-w-full rounded bg-[#E5E9F0]" />
      </div>
      <div className="grid gap-10 xl:grid-cols-2">
        <div className="space-y-5">
          {[0, 1, 2, 3, 4].map((row) => (
            <div key={row} className="h-12 rounded bg-[#E5E9F0]" />
          ))}
        </div>
        <div className="h-[620px] rounded-xl bg-[#E5E9F0]" />
      </div>
    </div>
  );
}
