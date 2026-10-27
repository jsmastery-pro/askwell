import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ project: null as null | { id: string; name: string; public_key: string } }));

vi.mock("@clerk/nextjs/server", () => ({ auth: { protect: async () => ({ userId: "user_owner" }) } }));
vi.mock("../../../../../lib/projects", () => ({ getOwnedProject: async () => state.project }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "app.test" }) }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const { default: InstallPage } = await import("./page");
const params = Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" });

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("InstallPage", () => {
  it("shows not found for a project the user doesn't own (or that doesn't exist)", async () => {
    state.project = null;
    await expect(InstallPage({ params })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("shows the project's real key in the snippet", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://askwell.example");
    state.project = { id: "p1", name: "Docs bot", public_key: "pk_real123" };
    render(await InstallPage({ params }));
    expect(
      screen.getByText('<script src="https://askwell.example/widget.js" data-key="pk_real123"></script>'),
    ).toBeTruthy();
  });
});
