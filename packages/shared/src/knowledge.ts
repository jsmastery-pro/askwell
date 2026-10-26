import { z } from "zod";
import { deleteResponseSchema, type DeleteResponse } from "./projects";

export const SOURCE_TYPES = ["text", "pdf", "md", "txt"] as const;
export const SOURCE_STATUSES = ["processing", "ready", "failed"] as const;

// 4 MB, not 10: Vercel caps function request bodies at 4.5 MB (project.md §9).
export const MAX_KNOWLEDGE_FILE_BYTES = 4 * 1024 * 1024;
// Uploaded file extension → source type. The server checks type and size (§9).
export const KNOWLEDGE_FILE_TYPES = { pdf: "pdf", md: "md", txt: "txt" } as const;

export const knowledgeSourceSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  type: z.enum(SOURCE_TYPES),
  status: z.enum(SOURCE_STATUSES),
  createdAt: z.iso.datetime(),
});
export type KnowledgeSource = z.infer<typeof knowledgeSourceSchema>;

const title = z.string().trim().min(1).max(120);

// POST /api/projects/:id/knowledge
// Pasted text arrives as JSON. A file arrives as multipart/form-data: a `file` part plus these fields.
export const addTextKnowledgeRequestSchema = z.object({
  type: z.literal("text"),
  title,
  content: z.string().trim().min(1),
});
export type AddTextKnowledgeRequest = z.infer<typeof addTextKnowledgeRequestSchema>;
export const addFileKnowledgeFieldsSchema = z.object({ title: title.optional() });
export type AddFileKnowledgeFields = z.infer<typeof addFileKnowledgeFieldsSchema>;
export const addKnowledgeResponseSchema = z.object({ source: knowledgeSourceSchema });
export type AddKnowledgeResponse = z.infer<typeof addKnowledgeResponseSchema>;

// DELETE /api/knowledge/:id
export const deleteKnowledgeResponseSchema = deleteResponseSchema;
export type DeleteKnowledgeResponse = DeleteResponse;
