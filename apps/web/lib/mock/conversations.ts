import type { GetConversationResponse } from "@askwell/shared";

type Thread = GetConversationResponse["conversation"];

const id = (n: number) => `9a7e4c20-1d2b-4c3d-9e4f-5a6b7c8d9e${String(n).padStart(2, "0")}`;
const msg = (n: number, role: "visitor" | "bot", body: string, createdAt: string) => ({
  id: `3b5d7f90-2a4c-4e6f-8a1b-3c5d7e9f1a${String(n).padStart(2, "0")}`,
  role,
  body,
  createdAt,
});

// Newest first. Some bodies look like HTML on purpose: screens must show them as text.
export const MOCK_THREADS: Thread[] = [
  {
    id: id(1),
    visitorId: "v_4f8c2e",
    createdAt: "2026-10-12T16:05:00.000Z",
    messages: [
      msg(1, "visitor", "Do you ship to Canada?", "2026-10-12T16:05:00.000Z"),
      msg(2, "bot", "Yes. Orders to Canada ship in 5–7 business days, with tracking.", "2026-10-12T16:05:04.000Z"),
      msg(3, "visitor", "And returns?", "2026-10-12T16:06:10.000Z"),
      msg(4, "bot", "You can return unused items within 30 days for a full refund.", "2026-10-12T16:06:13.000Z"),
    ],
  },
  {
    id: id(2),
    visitorId: "v_91b7d0",
    createdAt: "2026-10-12T10:22:00.000Z",
    messages: [
      msg(5, "visitor", "<script>alert('hi')</script> is this safe to paste?", "2026-10-12T10:22:00.000Z"),
      msg(6, "bot", "I don't know. That isn't covered in the docs I have.", "2026-10-12T10:22:03.000Z"),
    ],
  },
  {
    id: id(3),
    visitorId: "v_2c6a19",
    createdAt: "2026-10-11T19:47:00.000Z",
    messages: [
      msg(7, "visitor", "What's the warranty on the <b>Pro</b> model?", "2026-10-11T19:47:00.000Z"),
      msg(8, "bot", "The Pro model has a 2-year warranty covering parts and labour.", "2026-10-11T19:47:05.000Z"),
    ],
  },
  {
    id: id(4),
    visitorId: "v_7e03fa",
    createdAt: "2026-10-10T08:15:00.000Z",
    messages: [msg(9, "visitor", "Hi! Are you open on weekends?", "2026-10-10T08:15:00.000Z")],
  },
];
