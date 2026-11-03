import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import SignInPage from "./page";

vi.mock("@clerk/nextjs", () => ({ SignIn: () => <div data-clerk="sign-in" /> }));

describe("/sign-in", () => {
  it("renders Clerk's <SignIn />", () => {
    expect(renderToStaticMarkup(<SignInPage />)).toContain('data-clerk="sign-in"');
  });
});
