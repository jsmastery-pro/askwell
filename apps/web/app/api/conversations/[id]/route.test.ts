// @vitest-environment node
import { accounts, conversations, messages, projects } from "@askwell/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDb } from "../../../../lib/widget-config/test-db";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({ db: undefined as unknown, userId: null as string | null }));
vi.mock("@askwell/db/client", () => ({
  get db() {
    return state.db;
  },
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: state.userId }) }));

const { GET } = await import("./route");

let db: TestDb;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  state.db = db;
});

afterAll(() => close());

beforeEach(() => {
  state.userId = null;
});

const as = (userId: string | null) => {
  state.userId = userId;
};
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function seedProjectWithConversation(ownerId: string, publicKey: string) {
  await db.insert(accounts).values({ clerkUserId: ownerId, plan: "free" }).onConflictDoNothing();
  const [project] = await db.insert(projects).values({ ownerId, name: "Docs", publicKey }).returning();
  const [conversation] = await db.insert(conversations).values({ projectId: project!.id, visitorId: "v1" }).returning();
  await db.insert(messages).values({ conversationId: conversation!.id, role: "visitor", body: "Hi" });
  return conversation!.id;
}

describe("unauthenticated", () => {
  it("returns 401", async () => {
    const res = await GET(new Request("https://app.test"), ctx("00000000-0000-4000-8000-000000000000"));
    expect(res.status).toBe(401);
  });
});

describe("GET /api/conversations/:id", () => {
  it("returns the conversation with its messages", async () => {
    const conversationId = await seedProjectWithConversation("owner_a", "pk_conv_id_a");
    as("owner_a");

    const res = await GET(new Request("https://app.test"), ctx(conversationId));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.conversation.id).toBe(conversationId);
    expect(body.conversation.messages).toEqual([expect.objectContaining({ role: "visitor", body: "Hi" })]);
  });

  it("returns 404 for another owner's conversation", async () => {
    const conversationId = await seedProjectWithConversation("owner_b", "pk_conv_id_b");
    as("owner_c");

    const res = await GET(new Request("https://app.test"), ctx(conversationId));

    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_found");
  });

  it("returns 404 for an unknown or malformed id", async () => {
    as("owner_d");
    expect((await GET(new Request("https://app.test"), ctx("00000000-0000-4000-8000-000000000000"))).status).toBe(404);
    expect((await GET(new Request("https://app.test"), ctx("not-a-uuid"))).status).toBe(404);
  });
});
