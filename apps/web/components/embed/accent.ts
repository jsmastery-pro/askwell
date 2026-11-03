// The project's button color accents the send button and visitor bubbles.
import { DEFAULT_WIDGET_CONFIG, hexColorSchema } from "@askwell/shared";

export interface Accent {
  /** A validated #rrggbb color. */
  background: string;
  /** Black or white text, whichever reads better on `background` (design tokens). */
  foreground: string;
}

/** WCAG relative luminance of a #rrggbb color. */
function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** The accent for `buttonColor`. An invalid color falls back to the default. */
export function accentFor(buttonColor: string): Accent {
  const background = hexColorSchema.safeParse(buttonColor).success
    ? buttonColor
    : DEFAULT_WIDGET_CONFIG.button_color;
  // Contrast with white is (1.05)/(L+0.05); with black (L+0.05)/0.05. Pick the higher.
  const l = luminance(background);
  const whiteWins = 1.05 / (l + 0.05) >= (l + 0.05) / 0.05;
  return {
    background,
    foreground: whiteWins ? "var(--color-white)" : "var(--color-black)",
  };
}
