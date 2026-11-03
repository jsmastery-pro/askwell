// CORS for the public widget routes (project.md §9 "CORS"): any origin may
// call them, because the widget runs on customers' sites. No credentials:
// these routes never read cookies, and "*" can't be combined with them.
// Owner routes must NOT use these helpers (same-origin only).

export type PublicMethod = "GET" | "POST";

/** The CORS headers for a public route that answers `methods` (plus OPTIONS). */
export function publicCorsHeaders(methods: readonly PublicMethod[]): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": [...methods, "OPTIONS"].join(", "),
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

/** Adds the public CORS headers to `response` and returns it. */
export function withPublicCors(response: Response, methods: readonly PublicMethod[]): Response {
  for (const [name, value] of Object.entries(publicCorsHeaders(methods))) {
    response.headers.set(name, value);
  }
  return response;
}

/** The answer to a CORS preflight (OPTIONS): 204 with the public CORS headers. */
export function publicPreflight(methods: readonly PublicMethod[]): Response {
  return new Response(null, { status: 204, headers: publicCorsHeaders(methods) });
}
