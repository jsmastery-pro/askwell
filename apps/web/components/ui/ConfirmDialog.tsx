"use client";

import { useEffect, useId, useRef } from "react";
import { BUTTON_DESTRUCTIVE, BUTTON_SECONDARY } from "./styles";

type Props = {
  /** The question, e.g. `Delete "Help center"?` */
  title: string;
  /** What happens if they go ahead. */
  body: string;
  /** The confirm button, named for the action, e.g. "Delete project". */
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
};

/** Asks before a destructive action. Focus starts on Cancel, stays inside, and Escape cancels. */
export function ConfirmDialog({ title, body, confirmLabel, onCancel, onConfirm }: Props) {
  const id = useId();
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
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-body`}
        className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl"
      >
        <h2 id={`${id}-title`} className="font-semibold break-words text-[#161A24]">
          {title}
        </h2>
        <p id={`${id}-body`} className="mt-2 text-sm text-[#70788D]">
          {body}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button ref={cancelRef} type="button" onClick={onCancel} className={BUTTON_SECONDARY}>
            Cancel
          </button>
          <button ref={confirmRef} type="button" onClick={onConfirm} className={BUTTON_DESTRUCTIVE}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
