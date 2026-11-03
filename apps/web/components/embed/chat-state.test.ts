import { MAX_MESSAGE_LENGTH, type ApiErrorCode } from "@askwell/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  chatReducer,
  friendlyError,
  initialChatState,
  sendChatMessage,
  type ChatAction,
  type ChatState,
} from "./chat-state";
import {
  ChatError,
  failNextMockMessage,
  MOCK_REPLY,
  MOCK_REPLY_DELAY_MS,
  sendMessage,
} from "./send-message";

const KEY = "pk_test_123";
const VISITOR = "a".repeat(32);
const UUID = /^[0-9a-f-]{36}$/;

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  failNextMockMessage(null);
  vi.useRealTimers();
});

/** Runs sendChatMessage against the real mock, recording each state. */
function harness(conversationId: string | null = null) {
  let state: ChatState = { ...initialChatState, conversationId };
  const states: ChatState[] = [];
  let n = 0;
  const dispatch = (action: ChatAction) => {
    state = chatReducer(state, action);
    states.push(state);
  };
  const send = vi.fn(sendMessage);
  const run = (text: string) =>
    sendChatMessage(text, {
      key: KEY,
      visitorId: VISITOR,
      conversationId: state.conversationId,
      send,
      dispatch,
      newId: () => `m${++n}`,
    });
  return { run, send, states, current: () => state };
}

describe("mock sendMessage", () => {
  it("replies after ~800 ms with a new conversation ID", async () => {
    const pending = sendMessage({ key: KEY, visitorId: VISITOR, message: "Hi" });
    let done = false;
    void pending.then(() => (done = true));

    await vi.advanceTimersByTimeAsync(MOCK_REPLY_DELAY_MS - 1);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    const res = await pending;
    expect(res.reply).toBe(MOCK_REPLY);
    expect(res.conversationId).toMatch(UUID);
  });

  it("keeps the conversation ID it's given", async () => {
    const conversationId = crypto.randomUUID();
    const pending = sendMessage({ key: KEY, visitorId: VISITOR, conversationId, message: "Hi" });
    await vi.advanceTimersByTimeAsync(MOCK_REPLY_DELAY_MS);
    expect((await pending).conversationId).toBe(conversationId);
  });

  it("rejects an invalid body with validation_failed", async () => {
    const tooLong = "x".repeat(MAX_MESSAGE_LENGTH + 1);
    await expect(
      sendMessage({ key: KEY, visitorId: VISITOR, message: tooLong }),
    ).rejects.toMatchObject({ code: "validation_failed" });
  });

  it.each<ApiErrorCode>(["rate_limited", "quota_exceeded"])("can fail with %s", async (code) => {
    failNextMockMessage(code);
    const pending = sendMessage({ key: KEY, visitorId: VISITOR, message: "Hi" });
    const check = expect(pending).rejects.toBeInstanceOf(ChatError);
    await vi.advanceTimersByTimeAsync(MOCK_REPLY_DELAY_MS);
    await check;
    await expect(pending).rejects.toMatchObject({ code });
  });
});

describe("sendChatMessage", () => {
  it("shows the message and typing at once, then the mock reply", async () => {
    const h = harness();
    const done = h.run("  Do you ship to Canada?  ");

    // Right away: the visitor's message (trimmed) and the typing state.
    expect(h.current().messages).toEqual([
      { id: "m1", role: "visitor", text: "Do you ship to Canada?" },
    ]);
    expect(h.current().typing).toBe(true);

    await vi.advanceTimersByTimeAsync(MOCK_REPLY_DELAY_MS);
    await done;

    expect(h.current().typing).toBe(false);
    expect(h.current().messages.at(-1)).toEqual({ id: "m2", role: "bot", text: MOCK_REPLY });
    expect(h.current().conversationId).toMatch(UUID);
    expect(h.send).toHaveBeenCalledExactlyOnceWith({
      key: KEY,
      visitorId: VISITOR,
      message: "Do you ship to Canada?",
    });
  });

  it("sends the conversation ID from the first reply with the next message", async () => {
    const h = harness();
    const first = h.run("One");
    await vi.advanceTimersByTimeAsync(MOCK_REPLY_DELAY_MS);
    await first;
    const conversationId = h.current().conversationId;

    const second = h.run("Two");
    await vi.advanceTimersByTimeAsync(MOCK_REPLY_DELAY_MS);
    await second;

    expect(h.send.mock.calls[1]?.[0]).toMatchObject({ conversationId, message: "Two" });
    expect(h.current().conversationId).toBe(conversationId);
    expect(h.current().messages.map((m) => m.role)).toEqual(["visitor", "bot", "visitor", "bot"]);
  });

  it.each<ApiErrorCode>(["rate_limited", "quota_exceeded"])(
    "shows a friendly error for %s",
    async (code) => {
      failNextMockMessage(code);
      const h = harness();
      const done = h.run("Hello");
      await vi.advanceTimersByTimeAsync(MOCK_REPLY_DELAY_MS);
      await done;

      expect(h.current().typing).toBe(false);
      expect(h.current().error).toBe(code);
      expect(h.current().messages.map((m) => m.role)).toEqual(["visitor"]);
      expect(friendlyError(code)).not.toMatch(/rate_limited|quota_exceeded|error/i);
    },
  );

  it("clears the error on the next send", async () => {
    failNextMockMessage("rate_limited");
    const h = harness();
    const first = h.run("One");
    await vi.advanceTimersByTimeAsync(MOCK_REPLY_DELAY_MS);
    await first;
    expect(h.current().error).toBe("rate_limited");

    const second = h.run("Two");
    expect(h.current().error).toBeNull();
    await vi.advanceTimersByTimeAsync(MOCK_REPLY_DELAY_MS);
    await second;
  });

  it("treats an unexpected throw as internal", async () => {
    const h = harness();
    h.send.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await h.run("Hi");
    expect(h.current().error).toBe("internal");
  });

  it("sends nothing for empty or too-long text", async () => {
    const h = harness();
    expect(await h.run("   ")).toBe(false);
    expect(await h.run("x".repeat(MAX_MESSAGE_LENGTH + 1))).toBe(false);
    expect(h.send).not.toHaveBeenCalled();
    expect(h.states).toHaveLength(0);
  });
});
