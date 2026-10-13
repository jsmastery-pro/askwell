import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { APP_NAME } from "@askwell/shared";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NavBar } from "./NavBar";

const pathname = vi.hoisted(() => ({ current: "/dashboard/projects" }));
const email = vi.hoisted(() => ({ current: "owner@example.com" as string | null }));

vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));
vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({
    user: email.current ? { primaryEmailAddress: { emailAddress: email.current } } : null,
  }),
  SignOutButton: ({ children }: { children: ReactNode }) => <div data-testid="sign-out">{children}</div>,
}));

afterEach(() => {
  cleanup();
  pathname.current = "/dashboard/projects";
  email.current = "owner@example.com";
});

const nav = () => screen.getByRole("navigation", { name: "Dashboard" });
const current = () => within(nav()).queryAllByRole("link").filter((l) => l.getAttribute("aria-current") === "page");

describe("NavBar", () => {
  it("links the app name home, and shows only Projects and Billing", () => {
    render(<NavBar />);
    expect(screen.getByRole("link", { name: APP_NAME }).getAttribute("href")).toBe("/dashboard/projects");
    expect(within(nav()).getAllByRole("link").map((l) => [l.textContent, l.getAttribute("href")])).toEqual([
      ["Projects", "/dashboard/projects"],
      ["Billing", "/dashboard/billing"],
    ]);
  });

  it.each([
    ["/dashboard/projects", "Projects"],
    ["/dashboard/projects/11111111-2222-4333-8444-555555555555", "Projects"],
    ["/dashboard/projects/11111111-2222-4333-8444-555555555555/customize", "Projects"],
    ["/dashboard/billing", "Billing"],
  ])("marks the right link current on %s", (path, label) => {
    pathname.current = path;
    render(<NavBar />);
    expect(current().map((l) => l.textContent)).toEqual([label]);
  });

  it("marks nothing current on a look-alike path", () => {
    pathname.current = "/dashboard/projectsx";
    render(<NavBar />);
    expect(current()).toEqual([]);
  });
});

describe("AccountMenu", () => {
  const toggle = () => screen.getByRole("button", { name: /^Account/ });
  const panel = () => document.getElementById(toggle().getAttribute("aria-controls")!)!;

  it("shows the signed-in email and opens a menu with Sign out", () => {
    render(<NavBar />);
    expect(toggle().textContent).toContain("owner@example.com");
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(panel().hidden).toBe(true);

    fireEvent.click(toggle());
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(panel().hidden).toBe(false);
    expect(within(panel()).getByText("owner@example.com")).toBeTruthy();
    expect(within(panel()).getByRole("button", { name: "Sign out" })).toBeTruthy();
  });

  it("closes on Escape and returns focus to the toggle", () => {
    render(<NavBar />);
    fireEvent.click(toggle());
    const signOut = within(panel()).getByRole("button", { name: "Sign out" });
    act(() => signOut.focus());

    fireEvent.keyDown(signOut, { key: "Escape" });
    expect(panel().hidden).toBe(true);
    expect(document.activeElement).toBe(toggle());
  });

  it("closes on a click outside and when focus leaves it", () => {
    render(
      <>
        <NavBar />
        <button type="button">Elsewhere</button>
      </>,
    );
    fireEvent.click(toggle());
    fireEvent.pointerDown(document.body);
    expect(panel().hidden).toBe(true);

    fireEvent.click(toggle());
    fireEvent.blur(toggle(), { relatedTarget: screen.getByRole("button", { name: "Elsewhere" }) });
    expect(panel().hidden).toBe(true);
  });

  it("stays open when focus moves to the panel, as a Safari click on Sign out does", () => {
    render(<NavBar />);
    act(() => toggle().focus());
    fireEvent.click(toggle());

    // Safari doesn't focus a clicked button; focus goes to the nearest focusable ancestor.
    act(() => panel().focus());

    expect(document.activeElement).toBe(panel());
    expect(panel().hidden).toBe(false);
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
  });

  it("still offers Sign out before the user has loaded", () => {
    email.current = null;
    render(<NavBar />);
    expect(toggle().textContent).toBe("Account");
    fireEvent.click(toggle());
    expect(within(panel()).getByRole("button", { name: "Sign out" })).toBeTruthy();
  });
});
