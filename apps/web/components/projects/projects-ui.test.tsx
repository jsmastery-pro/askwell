import type { Project } from "@askwell/shared";
import { PLAN_LIMITS } from "@askwell/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createErrorView, CreateProjectForm } from "./CreateProjectForm";
import { formatCreatedDate } from "./format";
import { InstallSnippet } from "./InstallSnippet";
import { limitPrompt } from "./limit";
import { PlanLimitNotice } from "./PlanLimitNotice";
import { cardErrorText, ProjectCard } from "./ProjectCard";
import { ProjectNavFallback, ProjectNavLinks, projectSections } from "./ProjectNav";
import { ProjectsManager } from "./ProjectsManager";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/projects/p1/install" }));

const project = (id: string, name: string, created_at = "2026-11-03T19:39:11.845Z"): Project => ({
  id,
  owner_id: "user_1",
  name,
  public_key: `pk_${id}`,
  messages_used: 0,
  period_start: "2026-11-01T00:00:00+00:00",
  created_at,
});

const noop = () => undefined;

describe("ProjectsManager", () => {
  it("shows the create form and the empty state when there are no projects", () => {
    const html = renderToStaticMarkup(<ProjectsManager initialProjects={[]} plan="free" />);
    expect(html).toContain("New project");
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Create project<\/button>/);
    expect(html).toContain("No projects yet");
    expect(html).not.toContain("Your projects");
  });

  it("lists each project with its name, created date and links", () => {
    const html = renderToStaticMarkup(
      <ProjectsManager
        initialProjects={[project("p2", "Newer bot", "2026-11-03T12:00:00Z"), project("p1", "Docs bot", "2026-10-31T09:00:00Z")]}
        plan="free"
      />,
    );
    expect(html).toContain('aria-label="Your projects"');
    expect(html).not.toContain("No projects yet");
    expect(html.indexOf("Newer bot")).toBeLessThan(html.indexOf("Docs bot"));
    expect(html).toContain('href="/dashboard/projects/p1"');
    expect(html).toContain('href="/dashboard/projects/p1/install"');
    expect(html).toContain('<time dateTime="2026-10-31T09:00:00Z">Oct 31, 2026</time>');
    expect(html.match(/>Rename</g)).toHaveLength(2);
    expect(html.match(/>Delete</g)).toHaveLength(2);
  });

  it("renders a project name as text, never HTML", () => {
    const html = renderToStaticMarkup(
      <ProjectsManager initialProjects={[project("p1", "<img src=x onerror=alert(1)>")]} plan="free" />,
    );
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });
});

describe("the project limit", () => {
  it("Free: the plan_limit_reached error shows the upgrade prompt with PLAN_LIMITS numbers and a billing link", () => {
    const html = renderToStaticMarkup(
      <CreateProjectForm
        plan="free"
        onCreated={noop}
        initialError={{ code: "plan_limit_reached", message: "Your Free plan allows 1 project." }}
      />,
    );
    expect(html).toContain(
      `Free includes ${PLAN_LIMITS.free.projects} project. Upgrade to Pro for ${PLAN_LIMITS.pro.projects}.`,
    );
    expect(html).toMatch(/<a[^>]*href="\/dashboard\/billing"[^>]*>Upgrade to Pro<\/a>/);
    expect(html).toContain('role="alert"');
  });

  it("Pro: says the limit, with no upgrade link", () => {
    const html = renderToStaticMarkup(<PlanLimitNotice plan="pro" />);
    expect(html).toContain(`Pro includes ${PLAN_LIMITS.pro.projects} projects. Delete one to create another.`);
    expect(html).not.toContain("/dashboard/billing");
  });

  it("switches on the error code, not the HTTP status or the server's message", () => {
    expect(createErrorView({ code: "plan_limit_reached", message: "anything" })).toEqual({ kind: "limit" });
    expect(createErrorView({ code: "forbidden", message: "Your Free plan allows 1 project." })).toEqual({
      kind: "message",
      text: "Couldn't create the project. Try again.",
    });
    expect(createErrorView({ code: "validation_failed", message: "name: Too big" })).toEqual({
      kind: "message",
      text: "Use a name of 1 to 60 characters.",
    });
    expect(createErrorView({ code: "unauthorized", message: "x" }).kind).toBe("message");
  });

  it("other errors show a message, not the upgrade prompt", () => {
    const html = renderToStaticMarkup(
      <CreateProjectForm plan="free" onCreated={noop} initialError={{ code: "internal", message: "boom" }} />,
    );
    expect(html).toContain("Couldn&#x27;t create the project. Try again.");
    expect(html).not.toContain("Upgrade to Pro");
    expect(html).not.toContain("boom");
  });

  it("limitPrompt only offers an upgrade on Free", () => {
    expect(limitPrompt("free").upgrade).toBe(true);
    expect(limitPrompt("pro").upgrade).toBe(false);
  });
});

describe("ProjectCard", () => {
  it("rename mode shows the name in an input with Save and Cancel", () => {
    const html = renderToStaticMarkup(
      <ProjectCard project={project("p1", "Docs bot")} onRenamed={noop} onDeleted={noop} initialMode="rename" />,
    );
    expect(html).toMatch(/<input[^>]*value="Docs bot"/);
    expect(html).toMatch(/maxLength="60"/);
    expect(html).toContain(">Save<");
    expect(html).toContain(">Cancel<");
    expect(html).not.toContain(">Rename<");
  });

  it("delete asks to confirm first, naming the project", () => {
    const html = renderToStaticMarkup(
      <ProjectCard project={project("p1", "Docs bot")} onRenamed={noop} onDeleted={noop} initialMode="confirm-delete" />,
    );
    expect(html).toContain('aria-label="Confirm delete"');
    expect(html).toContain("Delete <strong");
    expect(html).toContain(">Delete project<");
    expect(html).toContain(">Cancel<");
  });

  it.each([
    ["not_found", "rename", "This project no longer exists. Reload the page."],
    ["unauthorized", "delete", "Your session ended. Sign in again."],
    ["internal", "rename", "Couldn't rename the project. Try again."],
    ["internal", "delete", "Couldn't delete the project. Try again."],
  ] as const)("explains a %s error on %s", (code, action, text) => {
    expect(cardErrorText({ code, message: "server text" }, action)).toBe(text);
  });
});

describe("ProjectNav", () => {
  it("has Knowledge and Install in Phase 3", () => {
    expect(projectSections("p1")).toEqual([
      { label: "Knowledge", href: "/dashboard/projects/p1/knowledge" },
      { label: "Install", href: "/dashboard/projects/p1/install" },
    ]);
  });

  it("marks the current section", () => {
    const html = renderToStaticMarkup(
      <ProjectNavLinks projectId="p1" pathname="/dashboard/projects/p1/install" />,
    );
    expect(html).toMatch(/<a[^>]*aria-current="page"[^>]*>Install<\/a>/);
  });

  it("its Suspense fallback shows the same tabs, none marked", () => {
    const html = renderToStaticMarkup(<ProjectNavFallback projectId="p1" />);
    expect(html).toContain(">Install<");
    expect(html).not.toContain("aria-current");
  });
});

describe("InstallSnippet", () => {
  it("shows the script tag as text with a copy button", () => {
    const snippet = '<script src="https://x.vercel.app/widget.js" data-key="pk_abc" async></script>';
    const html = renderToStaticMarkup(<InstallSnippet snippet={snippet} />);
    expect(html).toContain(
      "&lt;script src=&quot;https://x.vercel.app/widget.js&quot; data-key=&quot;pk_abc&quot; async&gt;&lt;/script&gt;",
    );
    expect(html).not.toContain("<script");
    expect(html).toMatch(/<button[^>]*>.*Copy.*<\/button>/);
  });
});

describe("formatCreatedDate", () => {
  it("formats in UTC so server and browser agree", () => {
    expect(formatCreatedDate("2026-11-03T23:59:00Z")).toBe("Nov 3, 2026");
    expect(formatCreatedDate("2026-11-04T00:00:00+02:00")).toBe("Nov 3, 2026");
  });

  it("returns an empty string for a bad date", () => {
    expect(formatCreatedDate("nope")).toBe("");
  });
});
