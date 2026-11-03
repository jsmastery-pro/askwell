// Light / dark theme for the signed-in app (docs/project.md §13).
//
// The visitor picks light, dark or system (the default). The choice lives in
// localStorage; the effective theme is set as `data-theme="light" | "dark"`
// on <html> (plus `data-theme-choice`) by an inline script before the first
// paint, so there's no flash. globals.css gives the light surface its dark
// values under `data-theme="dark"`, and `color-scheme: dark` makes Clerk's
// default theme render dark too.
//
// The landing page is dark on its own and doesn't change. /embed (the widget
// panel inside customers' sites) is out of scope: the script leaves it alone.
import { APP_NAME } from "@askwell/shared";

export const THEME_CHOICES = ["light", "dark", "system"] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];
export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = `${APP_NAME.toLowerCase()}:theme`;
export const DARK_QUERY = "(prefers-color-scheme: dark)";
/** Paths the theme never touches. */
export const THEME_EXCLUDED_PREFIX = "/embed";

export type ThemeStorage = Pick<Storage, "getItem" | "setItem">;

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return THEME_CHOICES.some((c) => c === value);
}

/** The stored choice; "system" when there's none, it's invalid, or storage throws. */
export function readThemeChoice(storage: ThemeStorage | null): ThemeChoice {
  try {
    const value = storage?.getItem(THEME_STORAGE_KEY);
    return isThemeChoice(value) ? value : "system";
  } catch {
    return "system";
  }
}

/** Saves the choice. Returns false if storage is missing or throws (the choice then lasts for this page only). */
export function writeThemeChoice(choice: ThemeChoice, storage: ThemeStorage | null): boolean {
  try {
    if (!storage) return false;
    storage.setItem(THEME_STORAGE_KEY, choice);
    return true;
  } catch {
    return false;
  }
}

/** The theme to show for a choice. */
export function resolveTheme(choice: ThemeChoice, prefersDark: boolean): Theme {
  if (choice === "system") return prefersDark ? "dark" : "light";
  return choice;
}

/** Sets `data-theme` and `data-theme-choice` on <html>. */
export function applyTheme(root: Pick<HTMLElement, "setAttribute">, choice: ThemeChoice, prefersDark: boolean): Theme {
  const theme = resolveTheme(choice, prefersDark);
  root.setAttribute("data-theme", theme);
  root.setAttribute("data-theme-choice", choice);
  return theme;
}

/**
 * The inline <head> script (app/layout.tsx). It runs before the first paint
 * and does what readThemeChoice + applyTheme do, in plain ES5, then follows
 * OS changes while the choice is "system". Any error leaves the light default.
 */
export function themeScript(): string {
  const key = JSON.stringify(THEME_STORAGE_KEY);
  const query = JSON.stringify(DARK_QUERY);
  const excluded = JSON.stringify(THEME_EXCLUDED_PREFIX);
  return `(function(){try{
if(location.pathname.indexOf(${excluded})===0)return;
var r=document.documentElement,m=window.matchMedia(${query});
var apply=function(){var c=null;try{c=localStorage.getItem(${key})}catch(e){}
if(c!=="light"&&c!=="dark")c="system";
r.setAttribute("data-theme",c==="dark"||(c==="system"&&m.matches)?"dark":"light");
r.setAttribute("data-theme-choice",c)};
apply();
m.addEventListener("change",function(){if(r.getAttribute("data-theme-choice")==="system")apply()});
}catch(e){}})();`;
}

/** The browser's localStorage, or null when there's none or reading it throws. */
export function browserStorage(): ThemeStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
