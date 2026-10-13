"use client";

import { useEffect, useRef } from "react";
import { BUTTON_SECONDARY, FOCUS } from "../projects/styles";

type Props = { title: string; isFile: boolean; onCancel: () => void; onConfirm: () => void };

export function ConfirmDelete({ title, isFile, onCancel, onConfirm }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  // The parent re-renders while this is open (status updates), so read the latest
  // callback from a ref and set up focus and Escape only once.
  const onCancelRef = useRef(onCancel);
  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    // aria-modal only tells assistive tech; keep Tab and Shift+Tab inside the dialog too.
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancelRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const first = cancelRef.current;
      const last = confirmRef.current;
      if (!first || !last) return;
      const active = document.activeElement;
      const inside = active === first || active === last;
      if (event.shiftKey && (active === first || !inside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !inside)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#10131D]/40 p-4 sm:items-center">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-delete-title"
        aria-describedby="confirm-delete-body"
        className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl"
      >
        <h2 id="confirm-delete-title" className="break-words font-semibold text-[#161A24]">
          Delete {title}?
        </h2>
        <p id="confirm-delete-body" className="mt-2 text-sm text-[#70788D]">
          {isFile
            ? "The file and everything learned from it are removed. The bot stops using it right away."
            : "The text and everything learned from it are removed. The bot stops using it right away."}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button ref={cancelRef} type="button" onClick={onCancel} className={BUTTON_SECONDARY}>
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className={`rounded-md bg-[#B42318] px-4 py-2 text-sm font-medium text-white hover:bg-[#912018] ${FOCUS}`}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
