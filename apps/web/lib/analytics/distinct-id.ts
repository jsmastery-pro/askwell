// Reads the browser's PostHog distinct ID from the request cookies, so a
// server error is tied to the person (the Clerk user ID once identified).

/** The distinct ID in the `ph_<key>_posthog` cookie, or undefined. */
export function distinctIdFromCookies(
  cookie: string | string[] | undefined,
  projectKey: string | undefined,
): string | undefined {
  if (!cookie || !projectKey) return undefined;
  const header = Array.isArray(cookie) ? cookie.join("; ") : cookie;
  const name = `ph_${projectKey}_posthog=`;
  const pair = header.split(";").map((part) => part.trim()).find((part) => part.startsWith(name));
  if (!pair) return undefined;
  try {
    const value: unknown = JSON.parse(decodeURIComponent(pair.slice(name.length)));
    if (value && typeof value === "object" && "distinct_id" in value) {
      const id = value.distinct_id;
      if (typeof id === "string" && id.length > 0) return id;
    }
  } catch {
    // A malformed cookie: report the error without a person.
  }
  return undefined;
}
