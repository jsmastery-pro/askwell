// Shared class names for the projects UI. Tokens only (globals.css): the
// dashboard's dark mode flips them, so no hardcoded colors here.

/** A text input on the dashboard's glass panels. */
export const inputClasses =
  "h-10 w-full min-w-0 rounded-control border border-line-strong bg-glass px-3 text-sm text-fg " +
  "placeholder:text-fg-subtle outline-none transition-colors " +
  "focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface " +
  "disabled:opacity-50";

/** An inline error or status line under a form. */
export const messageClasses = "text-sm text-fg";
