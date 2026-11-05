import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { authAppearance } from "../../../components/ui/clerk-appearance";
import SignInPage from "./page";

const signInProps = vi.fn();
vi.mock("@clerk/nextjs", () => ({
  SignIn: (props: unknown) => {
    signInProps(props);
    return <div data-clerk="sign-in" />;
  },
}));

describe("/sign-in", () => {
  it("renders Clerk's <SignIn />", () => {
    expect(renderToStaticMarkup(<SignInPage />)).toContain('data-clerk="sign-in"');
  });

  it("passes the phone tap-target appearance", () => {
    renderToStaticMarkup(<SignInPage />);
    expect(signInProps).toHaveBeenCalledWith({ appearance: authAppearance });
    expect(authAppearance.elements.formButtonPrimary).toContain("min-h-10!");
  });
});
