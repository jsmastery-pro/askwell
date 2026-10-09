const MOCK_DELAY_MS = 700;

// Phase 3 replaces this one function with a call to POST /api/widget/chat.
export async function getReply(message: string): Promise<string> {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY_MS));
  return `You asked: "${message}". This is a preview reply. Answers from this site's docs are coming soon.`;
}
