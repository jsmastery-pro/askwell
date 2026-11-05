// Clerk's default look (§13) on the sign-in and sign-up pages, with one
// change: on phones its buttons and inputs are at least 40px tall (tap
// targets). From `sm` up they're Clerk's own size. `!` because Clerk's own
// styles win over a plain class.

const TAP_TARGET = "min-h-10! sm:min-h-0!";

export const authAppearance = {
  elements: {
    socialButtonsBlockButton: TAP_TARGET,
    formFieldInput: TAP_TARGET,
    formButtonPrimary: TAP_TARGET,
    formFieldInputShowPasswordButton: "min-w-10! sm:min-w-0!",
  },
};
