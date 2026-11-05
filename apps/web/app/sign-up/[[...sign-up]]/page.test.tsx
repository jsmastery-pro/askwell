import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { authAppearance } from "../../../components/ui/clerk-appearance";
import SignUpPage from "./page";

const signUpProps = vi.fn();
vi.mock("@clerk/nextjs", () => ({
  SignUp: (props: unknown) => {
    signUpProps(props);
    return <div data-clerk="sign-up" />;
  },
}));

describe("/sign-up", () => {
  it("renders Clerk's <SignUp />", () => {
    expect(renderToStaticMarkup(<SignUpPage />)).toContain('data-clerk="sign-up"');
  });

  it("passes the phone tap-target appearance", () => {
    renderToStaticMarkup(<SignUpPage />);
    expect(signUpProps).toHaveBeenCalledWith({ appearance: authAppearance });
    expect(authAppearance.elements.formButtonPrimary).toContain("min-h-10!");
  });
});
