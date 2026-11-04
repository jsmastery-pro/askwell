// Phase 4 hook: the PostHog AI trace for each chat model call (project.md
// §6.6 step 7: model, tokens, cost, latency, project ID). No-op until then.

export type ChatTrace = {
  projectId: string;
  conversationId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
};

/**
 * TODO(Phase 4): send the PostHog AI generation event here. Must never throw
 * into the route; the reply is already saved when this runs.
 */
export function traceChat(trace: ChatTrace): void {
  void trace;
}
