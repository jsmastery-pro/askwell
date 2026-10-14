// The landing page's shared classes. Colours come from the tokens in app/globals.css.
export const FOCUS_RING = "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus";

export const BUTTON_PRIMARY = `inline-flex items-center justify-center rounded-full bg-ink px-6 py-3 font-medium text-inverse transition duration-200 hover:-translate-y-px hover:bg-ink/90 hover:shadow-lift ${FOCUS_RING}`;
export const BUTTON_GLASS = `glass inline-flex items-center justify-center rounded-full px-6 py-3 font-medium text-ink transition duration-200 hover:-translate-y-px hover:border-line-strong hover:bg-glass-hover ${FOCUS_RING}`;

export const CARD = "glass rounded-2xl transition duration-300 hover:border-line-strong";
