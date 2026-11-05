// The /ingest reverse proxy to PostHog Cloud. Requests go to our own origin,
// so ad blockers drop fewer landing-page events. Used by next.config.ts
// (rewrites, at build time) and instrumentation-client.ts (api_host).

/** Our same-origin path that rewrites to PostHog. */
export const INGEST_PATH = "/ingest";

type Region = "us" | "eu";

/** The PostHog Cloud region of an ingestion host, or null for any other host. */
export function posthogCloudRegion(host: string | undefined): Region | null {
  const match = host?.match(/^https:\/\/(us|eu)\.i\.posthog\.com\/?$/);
  return match ? (match[1] as Region) : null;
}

/** The rewrites for the proxy. None when the host isn't PostHog Cloud. */
export function ingestRewrites(host: string | undefined): { source: string; destination: string }[] {
  const region = posthogCloudRegion(host);
  if (!region) return [];
  const assets = `https://${region}-assets.i.posthog.com`;
  return [
    { source: `${INGEST_PATH}/static/:path*`, destination: `${assets}/static/:path*` },
    { source: `${INGEST_PATH}/array/:path*`, destination: `${assets}/array/:path*` },
    { source: `${INGEST_PATH}/:path*`, destination: `https://${region}.i.posthog.com/:path*` },
  ];
}

/** Browser SDK hosts: through the proxy for PostHog Cloud, else the host itself. */
export function browserHosts(host: string): { api_host: string; ui_host?: string } {
  const region = posthogCloudRegion(host);
  return region ? { api_host: INGEST_PATH, ui_host: `https://${region}.posthog.com` } : { api_host: host };
}
