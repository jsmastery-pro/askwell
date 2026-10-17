// posthog-js drops calls made before init, and init waits on the runtime config fetch, so callers
// that run on mount (like identify) wait for this. It never resolves when PostHog stays off.
let markReady: () => void = () => {};

export const posthogReady = new Promise<void>((resolve) => {
  markReady = resolve;
});

export const notifyPostHogReady = () => markReady();
