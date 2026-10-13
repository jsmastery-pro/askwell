// Demo activity for the dashboard home. Deterministic, so the chart doesn't change between
// renders: each project/day pair always gets the same count.

// FNV-1a, enough to spread project/day pairs into stable pseudo-random numbers.
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Bot replies sent by one project on one UTC day (YYYY-MM-DD). Scaled to the plan's monthly
 * limit, so a month of demo activity lands around 60 % of it, next to the real usage bar.
 * Quieter at weekends.
 */
export function mockMessagesOn(projectId: string, day: string, monthlyLimit: number): number {
  const weekday = new Date(`${day}T00:00:00.000Z`).getUTCDay();
  const average = (monthlyLimit * 0.6) / 30;
  const spread = 0.4 + (hash(`${projectId}:${day}`) % 1000) / 625; // 0.4 to 2.0
  return Math.round(average * spread * (weekday === 0 || weekday === 6 ? 0.5 : 1));
}

/** Roughly three messages per conversation. */
export const mockConversationsFor = (messages: number) => Math.round(messages / 3);

/** Some visitors come back, so unique visitors trail conversations. */
export const mockVisitorsFor = (conversations: number) => Math.round(conversations * 0.8);
