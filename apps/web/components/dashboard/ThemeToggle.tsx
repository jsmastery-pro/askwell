"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import {
  applyTheme,
  browserStorage,
  DARK_QUERY,
  isThemeChoice,
  writeThemeChoice,
  type ThemeChoice,
} from "../../lib/theme/theme";
import { cx } from "../ui/cx";
import { MonitorIcon, MoonIcon, SunIcon } from "./icons";

const OPTIONS: { value: ThemeChoice; label: string; icon: ReactNode }[] = [
  { value: "light", label: "Light", icon: <SunIcon className="size-4" /> },
  { value: "dark", label: "Dark", icon: <MoonIcon className="size-4" /> },
  { value: "system", label: "System", icon: <MonitorIcon className="size-4" /> },
];

// The current choice lives on <html data-theme-choice> (set by the inline
// theme script before paint). The server doesn't know it, so it renders
// nothing selected and the client fills it in after hydration.
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme-choice"] });
  return () => observer.disconnect();
}
const getChoice = (): ThemeChoice => {
  const value = document.documentElement.getAttribute("data-theme-choice");
  return isThemeChoice(value) ? value : "system";
};
const getServerChoice = (): ThemeChoice | null => null;

function choose(choice: ThemeChoice) {
  writeThemeChoice(choice, browserStorage());
  applyTheme(document.documentElement, choice, window.matchMedia(DARK_QUERY).matches);
}

/** Light / dark / system, remembered by the browser (lib/theme). */
export function ThemeToggle({ className }: { className?: string }) {
  const current = useSyncExternalStore(subscribe, getChoice, getServerChoice);

  return (
    <fieldset className={cx("min-w-0", className)}>
      <legend className="mb-2 px-1 text-xs font-medium text-fg-muted">Theme</legend>
      <div className="grid grid-cols-3 gap-1 rounded-control border border-line bg-glass p-1">
        {OPTIONS.map((option) => (
          <label key={option.value} className="relative min-w-0">
            <input
              type="radio"
              name="theme"
              value={option.value}
              checked={current === option.value}
              onChange={() => choose(option.value)}
              className="peer sr-only"
            />
            <span
              className={cx(
                "flex h-12 cursor-pointer flex-col items-center justify-center gap-1 rounded-[calc(var(--radius-control)-4px)] px-1 text-xs text-fg-muted transition-colors",
                "hover:text-fg peer-checked:bg-hover peer-checked:font-medium peer-checked:text-fg",
                "peer-focus-visible:ring-2 peer-focus-visible:ring-focus",
              )}
            >
              {option.icon}
              <span className="truncate">{option.label}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
