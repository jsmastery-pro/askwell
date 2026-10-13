import { ERROR_CODES } from "@askwell/shared";
import { describe, expect, it } from "vitest";
import { ReplyError, replyFailure } from "./reply-error";

describe("replyFailure", () => {
  it("maps the chat route's codes to the panel's states", () => {
    expect(replyFailure(new ReplyError(ERROR_CODES.rateLimited))).toBe("rate_limited");
    expect(replyFailure(new ReplyError(ERROR_CODES.quotaExceeded))).toBe("quota_exceeded");
  });

  it("treats every other code, error or value as a generic failure", () => {
    for (const error of [
      new ReplyError(ERROR_CODES.internal),
      new ReplyError("some_new_code"),
      new Error("rate_limited"),
      new TypeError("Failed to fetch"),
      "quota_exceeded",
      undefined,
    ]) {
      expect(replyFailure(error)).toBe("other");
    }
  });
});
