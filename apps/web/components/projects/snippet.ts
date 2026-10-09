/** The install tag for a project, e.g. `<script src="https://app/widget.js" data-key="pk_..."></script>`. */
export function buildInstallSnippet(appUrl: string, publicKey: string): string {
  const base = appUrl.trim().replace(/\/+$/, "");
  return `<script src="${base}/widget.js" data-key="${publicKey}"></script>`;
}

/**
 * The app's public URL. Read at request time (bracket access) because Next.js inlines literal
 * `process.env.NEXT_PUBLIC_*` reads at build, and InstaCloud injects env only at runtime.
 * Falls back to the request's own origin.
 */
export function resolveAppUrl(headers: Headers, env: Record<string, string | undefined> = process.env): string {
  const configured = env["NEXT_PUBLIC_APP_URL"]?.trim();
  if (configured) return configured;
  const host = headers.get("x-forwarded-host") ?? headers.get("host") ?? "localhost:3000";
  const proto = headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
