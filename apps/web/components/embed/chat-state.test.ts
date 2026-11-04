import { API_ERROR_STATUS, MAX_MESSAGE_LENGTH, type ApiErrorCode } from "@askwell/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  chatReducer,
  friendlyError,
  initialChatState,
  sendChatMessage,
  type ChatAction,
  type ChatState,
} from "./chat-state";
import { CHAT_ENDPOINT, ChatError, sendMessage } from "./send-message";

const KEY = "pk_test_123";
const VISITOR = "a".repeat(32);
const CONVERSATION = "4b2d1c1e-7f0a-4d7e-9a51-3f7c2b9d8e10";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const reply = (text: string, conversationId = CONVERSATION) =>
  json(200, { conversationId, reply: text });
const apiError = (code: ApiErrorCode) =>
  json(API_ERROR_STATUS[code], { error: { code, message: `server says ${code}` } });

const fetchMock = vi.fn<typeof fetch>();
/** The JSON body of the n-th request. */
const sentBody = (n: number) => JSON.parse(String(fetchMock.mock.calls[n]?.[1]?.body)) as unknown;

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

/** Runs sendChatMessage against the real sendMessage, recording each state. */
function harness(conversationId: string | null = null) {
  let state: ChatState = { ...initialChatState, conversationId };
  const states: ChatState[] = [];
  let n = 0;
  const dispatch = (action: ChatAction) => {
    state = chatReducer(state, action);
    states.push(state);
  };
  const run = (text: string) =>
    sendChatMessage(text, {
      key: KEY,
      visitorId: VISITOR,
      conversationId: state.conversationId,
      send: sendMessage,
      dispatch,
      newId: () => `m${++n}`,
    });
  return { run, states, current: () => state };
}

describe("sendMessage", () => {
  it("POSTs the body as JSON to the chat route and returns the reply", async () => {
    fetchMock.mockResolvedValueOnce(reply("We ship worldwide."));

    const res = await sendMessage({ key: KEY, visitorId: VISITOR, message: "Hi" });

    expect(res).toEqual({ conversationId: CONVERSATION, reply: "We ship worldwide." });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(CHAT_ENDPOINT);
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
    expect(sentBody(0)).toEqual({ key: KEY, visitorId: VISITOR, message: "Hi" });
  });

  it("rejects an invalid body with validation_failed, without a request", async () => {
    const tooLong = "x".repeat(MAX_MESSAGE_LENGTH + 1);
    await expect(
      sendMessage({ key: KEY, visitorId: VISITOR, message: tooLong }),
    ).rejects.toMatchObject({ code: "validation_failed" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each<ApiErrorCode>([
    "rate_limited",
    "quota_exceeded",
    "message_blocked",
    "not_found",
    "validation_failed",
    "internal",
  ])("parses a %s error response into ChatError", async (code) => {
    fetchMock.mockResolvedValueOnce(apiError(code));
    const pending = sendMessage({ key: KEY, visitorId: VISITOR, message: "Hi" });
    await expect(pending).rejects.toBeInstanceOf(ChatError);
    await expect(pending).rejects.toMatchObject({ code, message: `server says ${code}` });
  });

  it("treats a network failure as internal", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(
      sendMessage({ key: KEY, visitorId: VISITOR, message: "Hi" }),
    ).rejects.toMatchObject({ code: "internal" });
  });

  it("treats a non-JSON or unknown error body as internal", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html>Bad gateway</html>", { status: 502 }));
    await expect(
      sendMessage({ key: KEY, visitorId: VISITOR, message: "Hi" }),
    ).rejects.toMatchObject({ code: "internal" });

    fetchMock.mockResolvedValueOnce(json(500, { error: { code: "teapot", message: "?" } }));
    await expect(
      sendMessage({ key: KEY, visitorId: VISITOR, message: "Hi" }),
    ).rejects.toMatchObject({ code: "internal" });
  });

  it("treats a malformed success body as internal", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { reply: 42 }));
    await expect(
      sendMessage({ key: KEY, visitorId: VISITOR, message: "Hi" }),
    ).rejects.toMatchObject({ code: "internal" });
  });
});

describe("sendChatMessage", () => {
  it("shows the message and typing while waiting, then the reply", async () => {
    let respond: (r: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise((resolve) => (respond = resolve)));
    const h = harness();
    const done = h.run("  Do you ship to Canada?  ");

    // While the request is in flight: the visitor's message (trimmed) + typing.
    expect(h.current().messages).toEqual([
      { id: "m1", role: "visitor", text: "Do you ship to Canada?" },
    ]);
    expect(h.current().typing).toBe(true);

    respond(reply("Yes, we do."));
    await done;

    expect(h.current().typing).toBe(false);
    expect(h.current().messages.at(-1)).toEqual({ id: "m2", role: "bot", text: "Yes, we do." });
    expect(h.current().conversationId).toBe(CONVERSATION);
    expect(sentBody(0)).toEqual({ key: KEY, visitorId: VISITOR, message: "Do you ship to Canada?" });
  });

  it("sends the conversation ID from the first reply with the next message", async () => {
    fetchMock.mockResolvedValueOnce(reply("One back")).mockResolvedValueOnce(reply("Two back"));
    const h = harness();

    await h.run("One");
    await h.run("Two");

    expect(sentBody(0)).not.toHaveProperty("conversationId");
    expect(sentBody(1)).toEqual({
      key: KEY,
      visitorId: VISITOR,
      conversationId: CONVERSATION,
      message: "Two",
    });
    expect(h.current().messages.map((m) => m.text)).toEqual(["One", "One back", "Two", "Two back"]);
  });

  it.each<[ApiErrorCode, RegExp]>([
    ["rate_limited", /sending messages too fast/],
    ["quota_exceeded", /reached its limit for now/],
    ["message_blocked", /can't be sent/],
    ["not_found", /conversation has ended/],
    ["internal", /Something went wrong\. Please try again/],
  ])("shows the friendly message for %s", async (code, text) => {
    fetchMock.mockResolvedValueOnce(apiError(code));
    const h = harness();
    await h.run("Hello");

    expect(h.current().typing).toBe(false);
    expect(h.current().error).toBe(code);
    expect(h.current().messages.map((m) => m.role)).toEqual(["visitor"]);
    expect(friendlyError(code)).toMatch(text);
    // Never leaks the code or the server's message.
    expect(friendlyError(code)).not.toContain(code);
    expect(friendlyError(code)).not.toContain("server says");
  });

  it("shows the retry message on a network failure", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const h = harness();
    await h.run("Hi");
    expect(h.current().error).toBe("internal");
    expect(friendlyError("internal")).toMatch(/try again/);
  });

  it("keeps the conversation after an error, except not_found", async () => {
    fetchMock.mockResolvedValueOnce(apiError("rate_limited"));
    const kept = harness(CONVERSATION);
    await kept.run("Hi");
    expect(kept.current().conversationId).toBe(CONVERSATION);

    fetchMock
      .mockResolvedValueOnce(apiError("not_found"))
      .mockResolvedValueOnce(reply("Fresh start", "9e1f6a3b-2c4d-4e5f-8a7b-6c5d4e3f2a1b"));
    const reset = harness(CONVERSATION);
    await reset.run("Hi");
    expect(reset.current().conversationId).toBeNull();
    await reset.run("Hi again");
    expect(sentBody(2)).not.toHaveProperty("conversationId");
  });

  it("clears the error on the next send", async () => {
    fetchMock.mockResolvedValueOnce(apiError("rate_limited"));
    let respond: (r: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise((resolve) => (respond = resolve)));
    const h = harness();

    await h.run("One");
    expect(h.current().error).toBe("rate_limited");

    const second = h.run("Two");
    expect(h.current().error).toBeNull();
    respond(reply("ok"));
    await second;
  });

  it("sends nothing for empty or too-long text", async () => {
    const h = harness();
    expect(await h.run("   ")).toBe(false);
    expect(await h.run("x".repeat(MAX_MESSAGE_LENGTH + 1))).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(h.states).toHaveLength(0);
  });
});
