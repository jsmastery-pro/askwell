// @vitest-environment node
import { accounts, conversations, projects } from "@askwell/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDb } from "../../../../../lib/widget-config/test-db";

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
  await db.insert(conversations).values({ projectId: project!.id, visitorId: "v1" });
  return project!.id;
}

describe("unauthenticated", () => {
  it("returns 401", async () => {
    const res = await GET(new Request("https://app.test"), ctx("00000000-0000-4000-8000-000000000000"));
    expect(res.status).toBe(401);
  });
});

describe("GET /api/projects/:id/conversations", () => {
  it("lists the project's conversations", async () => {
    const projectId = await seedProjectWithConversation("owner_a", "pk_conv_route_a");
    as("owner_a");

    const res = await GET(new Request("https://app.test"), ctx(projectId));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.conversations).toHaveLength(1);
    expect(body.conversations[0].visitorId).toBe("v1");
  });

  it("returns 404 for another owner's project", async () => {
    const projectId = await seedProjectWithConversation("owner_b", "pk_conv_route_b");
    as("owner_c");

    const res = await GET(new Request("https://app.test"), ctx(projectId));

    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_found");
  });

  it("returns 404 for a malformed id", async () => {
    as("owner_d");
    const res = await GET(new Request("https://app.test"), ctx("not-a-uuid"));
    expect(res.status).toBe(404);
  });
});
