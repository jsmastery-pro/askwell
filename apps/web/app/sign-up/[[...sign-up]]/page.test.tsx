import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import SignUpPage from "./page";

vi.mock("@clerk/nextjs", () => ({ SignUp: () => <div data-clerk="sign-up" /> }));

describe("/sign-up", () => {
  it("renders Clerk's <SignUp />", () => {
    expect(renderToStaticMarkup(<SignUpPage />)).toContain('data-clerk="sign-up"');
  });
});
