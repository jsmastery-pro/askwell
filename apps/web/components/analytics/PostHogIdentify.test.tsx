import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ isLoaded: true, userId: "user_1" }) }));
vi.mock("posthog-js", () => ({ default: {} }));

const { PostHogIdentify, syncIdentity } = await import("./PostHogIdentify");

const client = {
  __loaded: true,
  state: "anonymous",
  distinctId: "anon_1",
  identify: vi.fn(),
  reset: vi.fn(),
  get_property: vi.fn((name: string) => (name === "$user_state" ? client.state : undefined)),
  get_distinct_id: vi.fn(() => client.distinctId),
};
const sync = (userId: string | null) => syncIdentity(client as unknown as Parameters<typeof syncIdentity>[0], userId);

beforeEach(() => {
  Object.assign(client, { __loaded: true, state: "anonymous", distinctId: "anon_1" });
  vi.clearAllMocks();
});

describe("syncIdentity", () => {
  it("identifies a signed-in owner by Clerk user ID only", () => {
    sync("user_1");
    expect(client.identify).toHaveBeenCalledWith("user_1");
    expect(client.reset).not.toHaveBeenCalled();
  });

  it("doesn't identify again when already that user", () => {
    Object.assign(client, { state: "identified", distinctId: "user_1" });
    sync("user_1");
    expect(client.identify).not.toHaveBeenCalled();
  });

  it("resets before identifying a different account", () => {
    Object.assign(client, { state: "identified", distinctId: "user_old" });
    sync("user_1");
    expect(client.reset).toHaveBeenCalledOnce();
    expect(client.identify).toHaveBeenCalledWith("user_1");
  });

  it("resets after sign-out", () => {
    Object.assign(client, { state: "identified", distinctId: "user_1" });
    sync(null);
    expect(client.reset).toHaveBeenCalledOnce();
  });

  it("leaves an anonymous visitor alone", () => {
    sync(null);
    expect(client.reset).not.toHaveBeenCalled();
    expect(client.identify).not.toHaveBeenCalled();
  });

  it("does nothing where PostHog isn't initialized (e.g. /embed)", () => {
    client.__loaded = false;
    sync("user_1");
    expect(client.identify).not.toHaveBeenCalled();
  });
});

describe("PostHogIdentify", () => {
  it("renders nothing", () => {
    expect(renderToStaticMarkup(<PostHogIdentify />)).toBe("");
  });
});
