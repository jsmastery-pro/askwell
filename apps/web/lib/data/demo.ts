// A short pause so mocked writes feel like network calls (pending states show).
export function demoDelay(ms = 400): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
