import { after } from "next/server";

/**
 * Runs `task` once the response has been sent, via Next's `after()`. Outside a request
 * lifecycle (e.g. a route handler invoked directly in a test) `after()` throws synchronously,
 * so this falls back to firing the task immediately rather than losing it.
 */
export function runAfterResponse(task: () => Promise<void>): void {
  try {
    after(task);
  } catch {
    void task();
  }
}
