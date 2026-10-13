const MOCK_DELAY_MS = 700;

// Resolves with the bot's reply, or throws a ReplyError (./reply-error) with the route's error code.
// MOCK: P3-T06 replaces this with POST /api/widget/chat. The mock never fails, so the error
// states are driven by tests.
export async function getReply(message: string): Promise<string> {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY_MS));
  return `You asked: "${message}". This is a preview reply. Answers from this site's docs are coming soon.`;
}
