// The dashboard's shared look. Reuse these instead of restating the classes.
export const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F2A33C]";

export const BUTTON_PRIMARY = `rounded-md bg-[#10131D] px-4 py-2 text-sm font-medium text-white hover:bg-[#232838] disabled:opacity-50 ${FOCUS}`;
export const BUTTON_SECONDARY = `rounded-md border border-[#CBD2DE] bg-white px-3 py-1.5 text-sm text-[#161A24] hover:bg-[#F5F7FA] disabled:opacity-50 ${FOCUS}`;
/** A quiet red text button, e.g. Delete in a list row. */
export const BUTTON_DANGER = `rounded-md px-3 py-1.5 text-sm text-[#B42318] hover:bg-[#FEF3F2] disabled:opacity-50 ${FOCUS}`;
/** A solid red button for the final step of a destructive action. */
export const BUTTON_DESTRUCTIVE = `rounded-md bg-[#B42318] px-4 py-2 text-sm font-medium text-white hover:bg-[#912018] disabled:opacity-50 ${FOCUS}`;
export const INPUT = `rounded-md border border-[#CBD2DE] bg-white px-3 py-2 text-sm text-[#161A24] ${FOCUS}`;
export const TEXT_LINK = `text-sm font-medium text-[#161A24] underline decoration-[#CBD2DE] underline-offset-4 hover:decoration-[#161A24] ${FOCUS}`;

/** A white panel. Lists add `divide-y divide-[#E3E7EE]`. */
export const CARD = "rounded-xl border border-[#D7DCE6] bg-white";
