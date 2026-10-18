import { DONT_KNOW_REPLY } from "@askwell/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getConversationId, setConversationId } from "../../components/widget-panel/conversation-id";
import { getReply } from "./reply";
import { ReplyError } from "./reply-error";

const CONVERSATION = "11111111-1111-4111-8111-111111111111";
const NEW_CONVERSATION = "22222222-2222-4222-8222-222222222222";
const who = { key: "pk_acme", visitorId: "v_1" };

const fetchMock = vi.fn();

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const fail = (status: number, code: string, message = "Server-side detail the visitor must not see") =>
  new Response(JSON.stringify({ error: { code, message } }), { status });

function sentBodies() {
  return fetchMock.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string));
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  window.localStorage.clear();
});

describe("getReply", () => {
  it("posts the key, visitor ID and message to the chat route, and returns the reply", async () => {
    fetchMock.mockResolvedValueOnce(ok({ conversationId: CONVERSATION, reply: "We ship in 5 days." }));

    expect(await getReply("How fast is shipping?", who)).toBe("We ship in 5 days.");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/widget/chat");
    expect((init as RequestInit).method).toBe("POST");
    expect(sentBodies()[0]).toEqual({ key: "pk_acme", visitorId: "v_1", message: "How fast is shipping?" });
  });

  it("stores the conversation and reuses it on the next message", async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ conversationId: CONVERSATION, reply: "First" }))
      .mockResolvedValueOnce(ok({ conversationId: CONVERSATION, reply: DONT_KNOW_REPLY }));

    await getReply("one", who);
    await getReply("two", who);

    expect(sentBodies()[1]).toEqual({ ...sentBodies()[0], message: "two", conversationId: CONVERSATION });
    expect(getConversationId("pk_acme")).toBe(CONVERSATION);
  });

  it("never sends another project's conversation", async () => {
    setConversationId("pk_other", CONVERSATION);
    fetchMock.mockResolvedValueOnce(ok({ conversationId: NEW_CONVERSATION, reply: "Hi" }));

    await getReply("hello", who);
    expect(sentBodies()[0]).not.toHaveProperty("conversationId");
  });

  it("clears a stale conversation on 404 and resends once without it", async () => {
    setConversationId("pk_acme", CONVERSATION);
    fetchMock
      .mockResolvedValueOnce(fail(404, "not_found"))
      .mockResolvedValueOnce(ok({ conversationId: NEW_CONVERSATION, reply: "Fresh start" }));

    expect(await getReply("still there?", who)).toBe("Fresh start");
    expect(sentBodies()).toEqual([
      { ...who, message: "still there?", conversationId: CONVERSATION },
      { ...who, message: "still there?" },
    ]);
    expect(getConversationId("pk_acme")).toBe(NEW_CONVERSATION);
  });

  it("resends only once: a second 404 is an error", async () => {
    setConversationId("pk_acme", CONVERSATION);
    fetchMock.mockResolvedValueOnce(fail(404, "not_found")).mockResolvedValueOnce(fail(404, "not_found"));

    await expect(getReply("hi", who)).rejects.toMatchObject({ code: "not_found" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("doesn't resend a 404 when there was no stored conversation (unknown key)", async () => {
    fetchMock.mockResolvedValueOnce(fail(404, "not_found"));
    await expect(getReply("hi", who)).rejects.toMatchObject({ code: "not_found" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [429, "rate_limited"],
    [429, "quota_exceeded"],
    [400, "invalid_input"],
    [500, "internal"],
  ])("throws a ReplyError with only the code for %i %s, never the server's text", async (status, code) => {
    fetchMock.mockResolvedValueOnce(fail(status, code));
    const error = await getReply("hi", who).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ReplyError);
    expect(error).toMatchObject({ code, message: code });
  });

  it("keeps the conversation after an error", async () => {
    setConversationId("pk_acme", CONVERSATION);
    fetchMock.mockResolvedValueOnce(fail(429, "rate_limited"));
    await getReply("hi", who).catch(() => {});
    expect(getConversationId("pk_acme")).toBe(CONVERSATION);
  });

  it("treats a non-JSON or malformed response as internal", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html>502</html>", { status: 502 }));
    await expect(getReply("hi", who)).rejects.toMatchObject({ code: "internal" });

    fetchMock.mockResolvedValueOnce(ok({ reply: "missing conversationId" }));
    await expect(getReply("hi", who)).rejects.toMatchObject({ code: "internal" });
  });

  it("lets a network failure through as a non-ReplyError (shown as the generic error)", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(getReply("hi", who)).rejects.toBeInstanceOf(TypeError);
  });
});
