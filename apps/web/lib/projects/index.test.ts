// @vitest-environment node
import { PLAN_LIMITS, publicKeySchema } from "@askwell/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { argsOf, callsTo, fakeSupabase, type FakeHandlers } from "../supabase/fake";
import { SupabaseQueryError } from "../supabase/query";

// Each call gets fake owner and service clients. Which rows RLS lets an owner read, rename or
// delete, and create_project's locking and limit count, are tested against the real migrations on
// pglite (packages/db); here, another owner's project is simply a row the fake doesn't return.
vi.mock("server-only", () => ({}));
vi.mock("../supabase/owner", () => ({
  createOwnerClient: () => {
    throw new Error("real owner client used in a test");
  },
}));
vi.mock("../supabase/service", () => ({
  createServiceClient: () => {
    throw new Error("real service client used in a test");
  },
}));

const captureServerEvent = vi.hoisted(() => vi.fn());
vi.mock("../posthog/server", () => ({ captureServerEvent }));

const { createProject, deleteProject, generatePublicKey, getOwnedProject, listProjects, renameProject, toProject } =
  await import("./index");

const PROJECT_ID = "11111111-2222-4333-8444-555555555555";

const projectRow = (overrides: Record<string, unknown> = {}) => ({
  id: PROJECT_ID,
  owner_id: "user_a",
  name: "Docs bot",
  public_key: "pk_abcdefghijklmnopqrstuvwxyz012345",
  messages_used: 3,
  period_start: "2026-10-01T00:00:00+00:00",
  created_at: "2026-10-01T00:00:00+00:00",
  ...overrides,
});

/** An owner client whose account has `plan`, and a service client for the create. */
function createClients(plan: "free" | "pro" | null, service: FakeHandlers = {}) {
  return {
    owner: fakeSupabase({ from: { accounts: { data: plan && { plan } } } }),
    service: fakeSupabase({
      from: { accounts: { data: [] } },
      rpc: { create_project: { data: projectRow() } },
      ...service,
    }),
  };
}

beforeEach(() => {
  vi.stubEnv("BUCKET_NAME", "askwell-test");
});

afterEach(() => {
  captureServerEvent.mockClear();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("generatePublicKey", () => {
  it("is pk_ + 32 URL-safe chars and valid for the widget routes", () => {
    const key = generatePublicKey();
    expect(key).toMatch(/^pk_[A-Za-z0-9_-]{32}$/);
    expect(publicKeySchema.safeParse(key).success).toBe(true);
  });

  it("doesn't repeat", () => {
    expect(new Set(Array.from({ length: 1000 }, generatePublicKey)).size).toBe(1000);
  });
});

describe("toProject", () => {
  it("maps the row to the API's field names and ISO timestamps", () => {
    expect(toProject(projectRow())).toEqual({
      id: PROJECT_ID,
      name: "Docs bot",
      publicKey: "pk_abcdefghijklmnopqrstuvwxyz012345",
      messagesUsed: 3,
      periodStart: "2026-10-01T00:00:00.000Z",
      createdAt: "2026-10-01T00:00:00.000Z",
    });
  });
});

describe("createProject", () => {
  it("creates through create_project on the service client, with the Free limit", async () => {
    const clients = createClients("free");

    const result = await createProject("user_a", "Docs bot", clients);

    expect(result).toEqual({ ok: true, project: projectRow() });
    const [rpc] = callsTo(clients.service, "create_project");
    const [args] = argsOf(rpc, "args") as [Record<string, unknown>];
    expect(args).toMatchObject({ p_owner_id: "user_a", p_name: "Docs bot", p_project_limit: PLAN_LIMITS.free.projects });
    expect(publicKeySchema.safeParse(args.p_public_key).success).toBe(true);
    expect(callsTo(clients.owner, "create_project")).toEqual([]);
  });

  it("passes the Pro limit for a Pro owner", async () => {
    const clients = createClients("pro");

    await createProject("user_pro", "P", clients);

    const [args] = argsOf(callsTo(clients.service, "create_project")[0], "args") as [Record<string, unknown>];
    expect(args.p_project_limit).toBe(PLAN_LIMITS.pro.projects);
  });

  it("treats an owner with no account row yet as Free", async () => {
    const clients = createClients(null);

    await createProject("user_new", "First", clients);

    const [args] = argsOf(callsTo(clients.service, "create_project")[0], "args") as [Record<string, unknown>];
    expect(args.p_project_limit).toBe(PLAN_LIMITS.free.projects);
  });

  it("ensures the account through the service client before creating", async () => {
    const clients = createClients("free");

    await createProject("user_a", "Docs bot", clients);

    expect(clients.service.calls.map((call) => call.target)).toEqual(["accounts", "create_project"]);
    expect(argsOf(callsTo(clients.service, "accounts")[0], "upsert")?.[0]).toEqual({ clerk_user_id: "user_a", plan: "free" });
  });

  it("returns plan_limit when create_project refuses with AWLIM", async () => {
    const clients = createClients("free", {
      rpc: { create_project: { error: { code: "AWLIM", message: "project limit reached (1)" } } },
    });

    expect(await createProject("user_a", "Second", clients)).toEqual({
      ok: false,
      reason: "plan_limit",
      limit: PLAN_LIMITS.free.projects,
    });
  });

  it("throws any other database error, keeping its code", async () => {
    const clients = createClients("free", {
      rpc: { create_project: { error: { code: "22023", message: "project limit must be a non-negative integer" } } },
    });

    const created = createProject("user_a", "Docs bot", clients);

    await expect(created).rejects.toBeInstanceOf(SupabaseQueryError);
    await expect(created).rejects.toMatchObject({ code: "22023" });
  });
});

describe("PostHog events", () => {
  it("sends project_created with the project id after a successful create", async () => {
    await createProject("user_a", "Docs bot", createClients("free"));

    expect(captureServerEvent).toHaveBeenCalledWith("user_a", "project_created", { project_id: PROJECT_ID });
  });

  it("sends nothing for a create refused by the plan limit", async () => {
    const clients = createClients("free", {
      rpc: { create_project: { error: { code: "AWLIM", message: "project limit reached (1)" } } },
    });

    await createProject("user_a", "Second", clients);

    expect(captureServerEvent).not.toHaveBeenCalled();
  });

  it("sends signed_up only when the create also created the account", async () => {
    await createProject("user_new", "First", createClients("free", { from: { accounts: { data: [{ clerk_user_id: "user_new" }] } } }));
    expect(captureServerEvent).toHaveBeenCalledWith("user_new", "signed_up");

    captureServerEvent.mockClear();
    await createProject("user_new", "Again", createClients("pro"));
    expect(captureServerEvent.mock.calls.some(([, event]) => event === "signed_up")).toBe(false);
  });
});

describe("owner reads", () => {
  it("lists the owner's projects, oldest first", async () => {
    const client = fakeSupabase({ from: { projects: { data: [projectRow()] } } });

    expect(await listProjects(client)).toEqual([projectRow()]);
    expect(argsOf(callsTo(client, "projects")[0], "order")).toEqual(["created_at", { ascending: true }]);
  });

  it("lists nothing when RLS returns no rows", async () => {
    expect(await listProjects(fakeSupabase())).toEqual([]);
  });

  it("gets the owner's project by id, or null when RLS hides it", async () => {
    const client = fakeSupabase({ from: { projects: [{ data: projectRow() }, { data: null }] } });

    expect(await getOwnedProject(PROJECT_ID, client)).toEqual(projectRow());
    expect(argsOf(callsTo(client, "projects")[0], "eq")).toEqual(["id", PROJECT_ID]);
    expect(await getOwnedProject(PROJECT_ID, client)).toBeNull();
  });
});

describe("renameProject", () => {
  it("updates only the name, through the owner client", async () => {
    const client = fakeSupabase({ from: { projects: { data: projectRow({ name: "New name" }) } } });

    expect((await renameProject(PROJECT_ID, "New name", client))?.name).toBe("New name");
    const [call] = callsTo(client, "projects");
    expect(argsOf(call, "update")).toEqual([{ name: "New name" }]);
    expect(argsOf(call, "eq")).toEqual(["id", PROJECT_ID]);
  });

  it("returns null when RLS hides the project, so no row changes", async () => {
    expect(await renameProject(PROJECT_ID, "Hacked", fakeSupabase())).toBeNull();
  });
});

describe("deleteProject", () => {
  /** Owner and service fakes that log the row delete and the Storage remove, in order. */
  function deleteClients({
    keys = ["projects/p/a", "projects/p/b"],
    deleted = [{ id: PROJECT_ID }],
    removeError = null as { code: string; message: string } | null,
  } = {}) {
    const order: string[] = [];
    const owner = fakeSupabase({
      from: {
        knowledge_sources: () => {
          order.push("read keys");
          return { data: keys.map((storage_key) => ({ storage_key })) };
        },
        projects: () => {
          order.push("delete row");
          return { data: deleted };
        },
      },
    });
    const service = fakeSupabase({
      storage: {
        "askwell-test": () => {
          order.push("remove files");
          return { data: [], error: removeError };
        },
      },
    });
    return { owner, service, order };
  }

  it("reads the file keys, deletes the row with the owner client, then removes the files", async () => {
    const { owner, service, order } = deleteClients();

    expect(await deleteProject(PROJECT_ID, { owner, service })).toBe(true);

    expect(order).toEqual(["read keys", "delete row", "remove files"]);
    const [sources] = callsTo(owner, "knowledge_sources");
    expect(argsOf(sources, "eq")).toEqual(["project_id", PROJECT_ID]);
    expect(argsOf(sources, "not")).toEqual(["storage_key", "is", null]);
    expect(argsOf(callsTo(owner, "projects")[0], "eq")).toEqual(["id", PROJECT_ID]);
    expect(argsOf(callsTo(service, "askwell-test")[0], "remove")).toEqual([["projects/p/a", "projects/p/b"]]);
    expect(callsTo(service, "projects")).toEqual([]);
  });

  it("returns false and removes nothing when RLS hides the project", async () => {
    const { owner, service, order } = deleteClients({ deleted: [] });

    expect(await deleteProject(PROJECT_ID, { owner, service })).toBe(false);
    expect(order).toEqual(["read keys", "delete row"]);
    expect(service.calls).toEqual([]);
  });

  it("skips Storage for a project with no files", async () => {
    const { owner, service } = deleteClients({ keys: [] });

    expect(await deleteProject(PROJECT_ID, { owner, service })).toBe(true);
    expect(service.calls).toEqual([]);
  });

  it("still succeeds when removing the files fails, logging the orphans", async () => {
    const { owner, service } = deleteClients({ removeError: { code: "500", message: "storage down" } });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await deleteProject(PROJECT_ID, { owner, service })).toBe(true);
    expect(logged).toHaveBeenCalledOnce();
  });

  it("still succeeds without BUCKET_NAME, logging instead of removing", async () => {
    vi.stubEnv("BUCKET_NAME", "");
    const { owner, service } = deleteClients();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await deleteProject(PROJECT_ID, { owner, service })).toBe(true);
    expect(service.calls).toEqual([]);
    expect(logged).toHaveBeenCalledOnce();
  });
});

describe("malformed project IDs", () => {
  it.each(["abc", "not-a-uuid-at-all", "11111111-2222-4333-8444-55555555555z"])(
    "%s reads as not found without querying",
    async (id) => {
      const owner = fakeSupabase();
      const service = fakeSupabase();
      expect(await getOwnedProject(id, owner)).toBeNull();
      expect(await renameProject(id, "X", owner)).toBeNull();
      expect(await deleteProject(id, { owner, service })).toBe(false);
      expect([...owner.calls, ...service.calls]).toEqual([]);
    },
  );
});
