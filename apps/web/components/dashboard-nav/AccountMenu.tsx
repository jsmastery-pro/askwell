"use client";

import { SignOutButton, useUser } from "@clerk/nextjs";
import { useEffect, useId, useRef, useState } from "react";
import { FOCUS } from "../ui/styles";

/** The navbar's account area: the signed-in email, and Sign out in a small disclosure menu. */
export function AccountMenu() {
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div
      ref={root}
      className="relative"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          setOpen(false);
          toggle.current?.focus();
        }
      }}
      onBlur={(event) => {
        if (!root.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={toggle}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className={`flex items-center gap-2.5 rounded-full py-1 pr-1 pl-1 text-sm text-[#C3C9D6] hover:text-white sm:pl-3 ${FOCUS}`}
      >
        <span className="sr-only">Account{email ? ": " : ""}</span>
        {email && <span className="hidden max-w-56 truncate sm:block">{email}</span>}
        <span
          aria-hidden="true"
          className="grid size-8 place-items-center rounded-full bg-[#F2A33C] text-sm font-semibold text-[#10131D] uppercase"
        >
          {email ? (
            email[0]
          ) : (
            <svg viewBox="0 0 20 20" fill="currentColor" className="size-4">
              <path d="M10 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0H3Z" />
            </svg>
          )}
        </span>
      </button>

      {/* tabIndex -1: in Safari a clicked button doesn't take focus, so focus lands on the panel
          instead of leaving the menu, and the blur above doesn't close it before the click. */}
      <div
        id={panelId}
        hidden={!open}
        tabIndex={-1}
        className="absolute top-full right-0 z-40 mt-2 w-64 rounded-lg border border-[#D7DCE6] bg-white p-2 shadow-lg shadow-[#10131D]/15 focus:outline-none"
      >
        {email && (
          <p className="truncate border-b border-[#E3E7EE] px-3 pt-2 pb-3 text-sm">
            <span className="block text-xs text-[#70788D]">Signed in as</span>
            <span className="text-[#161A24]">{email}</span>
          </p>
        )}
        <SignOutButton redirectUrl="/sign-in">
          <button
            type="button"
            className={`mt-1 w-full rounded-md px-3 py-2 text-left text-sm text-[#161A24] hover:bg-[#F5F7FA] ${FOCUS}`}
          >
            Sign out
          </button>
        </SignOutButton>
      </div>
    </div>
  );
}
