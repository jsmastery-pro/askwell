"use client";

import { BUTTON_SECONDARY } from "../../../../../components/projects/styles";

// Shown if loading conversations fails. The tabs above stay usable.
export default function ConversationsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-[#D7DCE6] bg-white px-6 py-10 text-center">
      <p className="font-medium text-[#161A24]">Conversations didn&apos;t load</p>
      <p className="mt-1 text-sm text-[#70788D]">Check your connection, then try again.</p>
      <button type="button" onClick={reset} className={`mt-5 ${BUTTON_SECONDARY}`}>
        Try again
      </button>
    </div>
  );
}
