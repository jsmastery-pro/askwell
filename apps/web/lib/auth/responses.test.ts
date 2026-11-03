import { describe, expect, it } from "vitest";
import { unauthorizedResponse } from "./responses";

describe("unauthorizedResponse", () => {
  it("returns 401 with the §8 error shape", async () => {
    const res = unauthorizedResponse();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: "unauthorized", message: expect.any(String) },
    });
  });
});
