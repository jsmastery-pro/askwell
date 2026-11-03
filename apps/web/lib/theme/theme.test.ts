import { describe, expect, it, vi } from "vitest";
import {
  applyTheme,
  readThemeChoice,
  resolveTheme,
  THEME_STORAGE_KEY,
  themeScript,
  writeThemeChoice,
  type ThemeStorage,
} from "./theme";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const storage: ThemeStorage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  };
  return { storage, data };
}

const throwing: ThemeStorage = {
  getItem: () => {
    throw new DOMException("blocked", "SecurityError");
  },
  setItem: () => {
    throw new DOMException("blocked", "SecurityError");
  },
};

describe("readThemeChoice", () => {
  it("returns the stored choice", () => {
    for (const choice of ["light", "dark", "system"] as const) {
      expect(readThemeChoice(memoryStorage({ [THEME_STORAGE_KEY]: choice }).storage)).toBe(choice);
    }
  });

  it("falls back to system when nothing valid is stored", () => {
    expect(readThemeChoice(memoryStorage().storage)).toBe("system");
    expect(readThemeChoice(memoryStorage({ [THEME_STORAGE_KEY]: "purple" }).storage)).toBe("system");
    expect(readThemeChoice(null)).toBe("system");
  });

  it("falls back to system when storage throws", () => {
    expect(readThemeChoice(throwing)).toBe("system");
  });
});

describe("writeThemeChoice", () => {
  it("stores the choice", () => {
    const { storage, data } = memoryStorage();
    expect(writeThemeChoice("dark", storage)).toBe(true);
    expect(data.get(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("returns false when storage is missing or throws", () => {
    expect(writeThemeChoice("dark", null)).toBe(false);
    expect(writeThemeChoice("dark", throwing)).toBe(false);
  });
});

describe("resolveTheme / applyTheme", () => {
  it("follows the OS only for system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("sets data-theme and data-theme-choice", () => {
    const attrs = new Map<string, string>();
    const root = { setAttribute: (k: string, v: string) => void attrs.set(k, v) };
    expect(applyTheme(root, "system", true)).toBe("dark");
    expect(Object.fromEntries(attrs)).toEqual({ "data-theme": "dark", "data-theme-choice": "system" });
  });
});

describe("themeScript (the inline script, run against fake browser globals)", () => {
  function run({
    path = "/dashboard",
    stored,
    prefersDark = false,
    storageThrows = false,
  }: { path?: string; stored?: string; prefersDark?: boolean; storageThrows?: boolean }) {
    const attrs = new Map<string, string>();
    const listeners: (() => void)[] = [];
    const media = {
      matches: prefersDark,
      addEventListener: (_type: string, fn: () => void) => void listeners.push(fn),
    };
    const document = {
      documentElement: {
        setAttribute: (k: string, v: string) => void attrs.set(k, v),
        getAttribute: (k: string) => attrs.get(k) ?? null,
      },
    };
    const localStorage = {
      getItem: vi.fn((k: string) => {
        if (storageThrows) throw new DOMException("blocked", "SecurityError");
        return k === THEME_STORAGE_KEY ? (stored ?? null) : null;
      }),
    };
    const window = { matchMedia: () => media };
    new Function("location", "document", "window", "localStorage", themeScript())(
      { pathname: path },
      document,
      window,
      localStorage,
    );
    const osChanges = (dark: boolean) => {
      media.matches = dark;
      for (const fn of listeners) fn();
    };
    return { attrs: () => Object.fromEntries(attrs), osChanges };
  }

  it("applies a stored choice", () => {
    expect(run({ stored: "dark" }).attrs()).toEqual({ "data-theme": "dark", "data-theme-choice": "dark" });
    expect(run({ stored: "light", prefersDark: true }).attrs()).toEqual({
      "data-theme": "light",
      "data-theme-choice": "light",
    });
  });

  it("defaults to system and follows the OS", () => {
    expect(run({ prefersDark: true }).attrs()).toEqual({ "data-theme": "dark", "data-theme-choice": "system" });
    expect(run({ prefersDark: false }).attrs()).toEqual({ "data-theme": "light", "data-theme-choice": "system" });
    expect(run({ stored: "purple", prefersDark: true }).attrs()["data-theme-choice"]).toBe("system");
  });

  it("treats a storage error as system", () => {
    expect(run({ storageThrows: true, prefersDark: true }).attrs()).toEqual({
      "data-theme": "dark",
      "data-theme-choice": "system",
    });
  });

  it("tracks OS changes only while the choice is system", () => {
    const system = run({ prefersDark: false });
    system.osChanges(true);
    expect(system.attrs()["data-theme"]).toBe("dark");

    const explicit = run({ stored: "light" });
    explicit.osChanges(true);
    expect(explicit.attrs()["data-theme"]).toBe("light");
  });

  it("leaves /embed alone", () => {
    expect(run({ path: "/embed", stored: "dark" }).attrs()).toEqual({});
    expect(run({ path: "/embed/x", prefersDark: true }).attrs()).toEqual({});
  });
});
