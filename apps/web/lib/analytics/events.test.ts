import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const posthog = { __loaded: true, capture: vi.fn() };
vi.mock("posthog-js", () => ({ default: posthog }));

const { captureClientEvent, serverEvent } = await import("./events");
const { InstallSnippet } = await import("../../components/projects/InstallSnippet");

beforeEach(() => {
  posthog.__loaded = true;
  posthog.capture.mockReset();
});

describe("serverEvent", () => {
  it("builds the event for captureServerEvent with the owner's ID", () => {
    expect(serverEvent("user_1", "knowledge_added", { project_id: "p1", source_type: "pdf" })).toEqual({
      distinctId: "user_1",
      event: "knowledge_added",
      properties: { project_id: "p1", source_type: "pdf" },
    });
    expect(serverEvent("user_1", "signed_up", {})).toEqual({ distinctId: "user_1", event: "signed_up", properties: {} });
  });

  it("only accepts each event's own properties", () => {
    // @ts-expect-error: no free-form text on knowledge_added.
    serverEvent("user_1", "knowledge_added", { project_id: "p1", source_type: "text", text: "secret" });
    // @ts-expect-error: message_blocked takes a known reason, not the message.
    serverEvent("user_1", "message_blocked", { project_id: "p1", reason: "hello" });
    // @ts-expect-error: not an event in the map.
    serverEvent("user_1", "made_up", {});
  });
});

describe("captureClientEvent", () => {
  it("captures through posthog-js", () => {
    captureClientEvent("snippet_copied", { project_id: "p1" });
    expect(posthog.capture).toHaveBeenCalledWith("snippet_copied", { project_id: "p1" });
  });

  it("does nothing where PostHog isn't initialized", () => {
    posthog.__loaded = false;
    captureClientEvent("snippet_copied", { project_id: "p1" });
    expect(posthog.capture).not.toHaveBeenCalled();
  });

  it("never throws into the UI", () => {
    posthog.capture.mockImplementation(() => {
      throw new Error("boom");
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => captureClientEvent("snippet_copied", { project_id: "p1" })).not.toThrow();
    error.mockRestore();
  });
});

/** The first element in `node`'s tree whose props have `prop`. */
function findWithProp(node: ReactNode, prop: string): ReactElement<Record<string, unknown>> | undefined {
  if (!isValidElement<Record<string, unknown>>(node)) {
    return Array.isArray(node) ? node.map((child) => findWithProp(child, prop)).find(Boolean) : undefined;
  }
  if (prop in node.props) return node;
  return findWithProp(node.props.children as ReactNode, prop);
}

describe("InstallSnippet", () => {
  it("sends snippet_copied with the project ID when the copy succeeds", () => {
    const tree = InstallSnippet({ projectId: "p1", snippet: "<script></script>" });
    const copy = findWithProp(createElement("div", null, tree), "onCopied");
    expect(posthog.capture).not.toHaveBeenCalled();
    (copy?.props.onCopied as () => void)();
    expect(posthog.capture).toHaveBeenCalledOnce();
    expect(posthog.capture).toHaveBeenCalledWith("snippet_copied", { project_id: "p1" });
  });
});
