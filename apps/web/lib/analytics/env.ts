// PostHog's key and host on the server, read at request time.
//
// Next inlines a literal `process.env.NEXT_PUBLIC_*` read at build time, on
// the server too. Reading by a computed name skips that, so the values come
// from the running deployment's environment (project.md §8, §11).

const KEY_VAR = "NEXT_PUBLIC_POSTHOG_KEY";
const HOST_VAR = "NEXT_PUBLIC_POSTHOG_HOST";

function readEnv(name: string): string | undefined {
  return process.env[name] || undefined;
}

/** The project key and host, or null when either isn't set. */
export function posthogServerEnv(): { key: string; host: string } | null {
  const key = readEnv(KEY_VAR);
  const host = readEnv(HOST_VAR);
  return key && host ? { key, host } : null;
}
