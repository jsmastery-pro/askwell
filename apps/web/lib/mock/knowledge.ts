import type { KnowledgeSource } from "@askwell/shared";

// Fixed values so renders are deterministic. Covers every type and status.
export const MOCK_KNOWLEDGE_SOURCES: KnowledgeSource[] = [
  {
    id: "6f1c2a10-3b4d-4e5f-8a9b-0c1d2e3f4a51",
    title: "Product handbook 2026.pdf",
    type: "pdf",
    status: "ready",
    createdAt: "2026-10-02T09:14:00.000Z",
  },
  {
    id: "6f1c2a10-3b4d-4e5f-8a9b-0c1d2e3f4a52",
    title: "Shipping and returns.md",
    type: "md",
    status: "ready",
    createdAt: "2026-10-03T15:40:00.000Z",
  },
  {
    id: "6f1c2a10-3b4d-4e5f-8a9b-0c1d2e3f4a53",
    title: "Pricing FAQ",
    type: "text",
    status: "ready",
    createdAt: "2026-10-05T11:02:00.000Z",
  },
  {
    id: "6f1c2a10-3b4d-4e5f-8a9b-0c1d2e3f4a54",
    title: "Warranty terms.txt",
    type: "txt",
    status: "processing",
    createdAt: "2026-10-11T08:30:00.000Z",
  },
  {
    id: "6f1c2a10-3b4d-4e5f-8a9b-0c1d2e3f4a55",
    title: "Scanned catalogue.pdf",
    type: "pdf",
    status: "failed",
    createdAt: "2026-10-11T08:31:00.000Z",
  },
];
