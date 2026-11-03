// The install snippet an owner pastes on their site (project.md §6.9).
//
// APP_URL is where widget.js is served from: NEXT_PUBLIC_APP_URL when it's
// set (production, local), otherwise the origin of the request that rendered
// the page, because every Vercel preview has its own URL.

/** A URL's origin (scheme + host + port), or null if it isn't an http(s) URL. */
function httpOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * The origin of the current request, from its headers. Vercel (and most
 * proxies) send the public host in `x-forwarded-host` and the scheme in
 * `x-forwarded-proto`. Returns null if there's no usable host.
 */
export function requestOrigin(headers: Pick<Headers, "get">): string | null {
  const host = (headers.get("x-forwarded-host") ?? headers.get("host"))?.split(",")[0]?.trim();
  if (!host) return null;
  const forwardedProto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto = forwardedProto === "http" || forwardedProto === "https" ? forwardedProto : "https";
  return httpOrigin(`${proto}://${host}`);
}

/**
 * The app's base URL: `NEXT_PUBLIC_APP_URL` when it's a valid http(s) URL,
 * otherwise the request's origin. Throws if neither is usable.
 */
export function resolveAppUrl(envAppUrl: string | undefined, origin: string | null): string {
  const fromEnv = envAppUrl?.trim() ? httpOrigin(envAppUrl.trim()) : null;
  const appUrl = fromEnv ?? origin;
  if (!appUrl) throw new Error("Can't work out the app URL: set NEXT_PUBLIC_APP_URL.");
  return appUrl;
}

/** The script tag that installs the widget for `publicKey`. */
export function installSnippet(appUrl: string, publicKey: string): string {
  return `<script src="${appUrl}/widget.js" data-key="${publicKey}" async></script>`;
}
