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

/** Bot replies sent by one project on one UTC day (YYYY-MM-DD). Quieter at weekends. */
export function mockMessagesOn(projectId: string, day: string): number {
  const weekday = new Date(`${day}T00:00:00.000Z`).getUTCDay();
  const base = weekday === 0 || weekday === 6 ? 4 : 12;
  return base + (hash(`${projectId}:${day}`) % 25);
}

/** Roughly three messages per conversation. */
export const mockConversationsFor = (messages: number) => Math.round(messages / 3);

/** Some visitors come back, so unique visitors trail conversations. */
export const mockVisitorsFor = (conversations: number) => Math.round(conversations * 0.8);
