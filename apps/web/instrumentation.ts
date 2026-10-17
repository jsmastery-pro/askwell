import type { Instrumentation } from "next";

export function register() {}

/** Server-side errors from route handlers, server components, and server actions. */
export const onRequestError: Instrumentation.onRequestError = async (error) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { captureServerException } = await import("./lib/posthog/server");
  captureServerException(error);
};
