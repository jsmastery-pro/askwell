// The dashboard's shared look, on the tokens in app/globals.css. Reuse these instead of restating the classes.
export const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";
/** For controls on a black (`bg-ink`) block, where a black ring wouldn't show. */
export const FOCUS_ON_INK = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inverse";

export const BUTTON_PRIMARY = `rounded-md transition-colors bg-ink px-4 py-2 text-sm font-medium text-inverse hover:bg-ink/85 disabled:opacity-50 ${FOCUS}`;
export const BUTTON_SECONDARY = `rounded-md transition-colors border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink hover:bg-canvas disabled:opacity-50 ${FOCUS}`;
/** A quiet red text button, e.g. Delete in a list row. */
export const BUTTON_DANGER = `rounded-md transition-colors px-3 py-1.5 text-sm text-danger hover:bg-danger-soft disabled:opacity-50 ${FOCUS}`;
/** A solid red button for the final step of a destructive action. */
export const BUTTON_DESTRUCTIVE = `rounded-md transition-colors bg-danger px-4 py-2 text-sm font-medium text-inverse hover:bg-danger/85 disabled:opacity-50 ${FOCUS}`;
export const INPUT = `rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink ${FOCUS}`;
export const TEXT_LINK = `text-sm font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink ${FOCUS}`;

/** A solid white panel, for anything dense or interactive: forms, lists, threads. Lists add `divide-y divide-line`. */
export const CARD = "rounded-xl border border-line bg-surface";
/** Light glass over the canvas, for summary cards (stats, the chart). Falls back to solid. */
export const GLASS_CARD = "glass rounded-xl";
