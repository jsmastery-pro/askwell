import { describe, expect, it } from "vitest";
import { isEmbedMessage as sharedIsEmbedMessage } from "../../../packages/shared/src/index";
import {
  MAX_PANEL_HEIGHT,
  MIN_PANEL_HEIGHT,
  acceptMessage,
  clampHeight,
  isEmbedMessage,
} from "./messages";

const BASE = "https://app.example";
const frame = { name: "our iframe's window" };

const SAMPLES: unknown[] = [
  { type: "askwell:close" },
  { type: "askwell:resize", height: 0 },
  { type: "askwell:resize", height: 480.5 },
  { type: "askwell:resize", height: 10_000 },
  { type: "askwell:unread", count: 0 },
  { type: "askwell:unread", count: 3 },
  undefined,
  null,
  "askwell:close",
  42,
  [],
  ["askwell:close"],
  {},
  { type: "askwell:open" },
  { type: "ASKWELL:CLOSE" },
  { type: "askwell:close", extra: 1 },
  { type: "askwell:resize" },
  { type: "askwell:resize", height: "480" },
  { type: "askwell:resize", height: -1 },
  { type: "askwell:resize", height: Number.NaN },
  { type: "askwell:resize", height: Infinity },
  { type: "askwell:resize", height: 10_001 },
  { type: "askwell:resize", height: 100, width: 100 },
  { type: "askwell:resize", width: 100 },
  { type: "askwell:unread" },
  { type: "askwell:unread", count: 1.5 },
  { type: "askwell:unread", count: -1 },
  { type: "askwell:unread", count: "2" },
  { type: "askwell:unread", total: 2 },
];

describe("isEmbedMessage", () => {
  it.each(SAMPLES.map((s) => [JSON.stringify(s) ?? String(s), s]))(
    "agrees with the shared guard for %s",
    (_label, sample) => {
      expect(isEmbedMessage(sample)).toBe(sharedIsEmbedMessage(sample));
    },
  );
});

describe("acceptMessage", () => {
  const event = (origin: string, source: unknown, data: unknown) =>
    ({ origin, source, data }) as Pick<MessageEvent, "origin" | "source" | "data">;

  it("accepts a valid message from our iframe on the base origin", () => {
    expect(acceptMessage(event(BASE, frame, { type: "askwell:close" }), BASE, frame)).toEqual({
      type: "askwell:close",
    });
  });

  it("rejects any other origin", () => {
    for (const origin of ["https://evil.example", "http://app.example", "https://app.example:444", "null", ""]) {
      expect(acceptMessage(event(origin, frame, { type: "askwell:close" }), BASE, frame)).toBeNull();
    }
  });

  it("rejects any other source, even from the base origin", () => {
    const other = { name: "another frame" };
    expect(acceptMessage(event(BASE, other, { type: "askwell:close" }), BASE, frame)).toBeNull();
    expect(acceptMessage(event(BASE, null, { type: "askwell:close" }), BASE, frame)).toBeNull();
  });

  it("rejects everything before the iframe exists", () => {
    expect(acceptMessage(event(BASE, null, { type: "askwell:close" }), BASE, null)).toBeNull();
    expect(acceptMessage(event(BASE, undefined, { type: "askwell:close" }), BASE, undefined)).toBeNull();
  });

  it("rejects wrong shapes from our iframe", () => {
    for (const data of [{ type: "askwell:open" }, { type: "askwell:close", x: 1 }, "askwell:close"]) {
      expect(acceptMessage(event(BASE, frame, data), BASE, frame)).toBeNull();
    }
  });
});

describe("clampHeight", () => {
  it("keeps the panel between its limits", () => {
    expect(clampHeight(73)).toBe(73);
    expect(clampHeight(0)).toBe(MIN_PANEL_HEIGHT);
    expect(clampHeight(10_000)).toBe(MAX_PANEL_HEIGHT);
    expect(clampHeight(99.6)).toBe(100);
  });
});
