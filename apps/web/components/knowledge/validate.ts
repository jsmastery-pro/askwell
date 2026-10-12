import {
  addTextKnowledgeRequestSchema,
  KNOWLEDGE_FILE_TYPES,
  MAX_KNOWLEDGE_FILE_BYTES,
  type AddTextKnowledgeRequest,
} from "@askwell/shared";

// Checked in the browser so the owner sees the problem before anything is sent.
// The server checks type and size again (project.md §9).

export const ACCEPT = ".pdf,.md,.txt,application/pdf,text/markdown,text/plain";

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const LIMIT_LABEL = `${MAX_KNOWLEDGE_FILE_BYTES / (1024 * 1024)} MB`;

export function checkFile(file: { name: string; size: number }): string | null {
  const dot = file.name.lastIndexOf(".");
  const extension = dot > 0 ? file.name.slice(dot + 1).toLowerCase() : "";
  if (!Object.hasOwn(KNOWLEDGE_FILE_TYPES, extension)) {
    return "Only PDF, Markdown (.md) and plain text (.txt) files can be added.";
  }
  if (file.size === 0) return "This file is empty.";
  if (file.size > MAX_KNOWLEDGE_FILE_BYTES) {
    return `This file is ${formatBytes(file.size)}. Files can be up to ${LIMIT_LABEL}.`;
  }
  return null;
}

type TextErrors = { title?: string; content?: string };

export function checkText(
  title: string,
  content: string,
): { ok: true; request: AddTextKnowledgeRequest } | { ok: false; errors: TextErrors } {
  const parsed = addTextKnowledgeRequestSchema.safeParse({ type: "text", title, content });
  if (parsed.success) return { ok: true, request: parsed.data };

  const errors: TextErrors = {};
  for (const issue of parsed.error.issues) {
    if (issue.path[0] === "title" && !errors.title) {
      errors.title = title.trim() ? "Keep the title under 120 characters." : "Add a title.";
    }
    if (issue.path[0] === "content" && !errors.content) errors.content = "Paste some text.";
  }
  return { ok: false, errors };
}
