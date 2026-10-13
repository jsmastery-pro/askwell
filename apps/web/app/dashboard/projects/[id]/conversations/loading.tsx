// Shown while the conversation list or a thread loads.
export default function ConversationsLoading() {
  return (
    <div role="status" aria-label="Loading conversations" className="space-y-6 motion-safe:animate-pulse">
      <div className="space-y-3">
        <div className="h-6 w-44 rounded bg-[#DDE2EA]" />
        <div className="h-4 w-72 max-w-full rounded bg-[#E5E9F0]" />
      </div>
      <div className="space-y-3">
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className="h-14 rounded bg-[#E5E9F0]" />
        ))}
      </div>
    </div>
  );
}
