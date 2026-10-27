import { z } from "zod";
import { deleteResponseSchema, type DeleteResponse } from "./projects";

export const SOURCE_TYPES = ["text", "pdf", "md", "txt"] as const;
export const SOURCE_STATUSES = ["processing", "ready", "failed"] as const;

// Back to 10 MB (SB-T06): the file goes straight from the browser to Supabase Storage with a
// signed URL, so Vercel's 4.5 MB function-body limit no longer applies.
export const MAX_KNOWLEDGE_FILE_BYTES = 10 * 1024 * 1024;
// Uploaded file extension → source type. The server checks type and size (§9).
export const KNOWLEDGE_FILE_TYPES = { pdf: "pdf", md: "md", txt: "txt" } as const;
// MIME types the `knowledge` Storage bucket itself accepts (its migration sets the same list as
// `allowed_mime_types`), keyed the same way as KNOWLEDGE_FILE_TYPES.
export const KNOWLEDGE_MIME_TYPES: Record<keyof typeof KNOWLEDGE_FILE_TYPES, string> = {
  pdf: "application/pdf",
  md: "text/markdown",
  txt: "text/plain",
};

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
// Pasted text only now (SB-T06): a file goes through upload-url + finalize below instead.
export const addTextKnowledgeRequestSchema = z.object({
  type: z.literal("text"),
  title,
  content: z.string().trim().min(1),
});
export type AddTextKnowledgeRequest = z.infer<typeof addTextKnowledgeRequestSchema>;
export const addKnowledgeResponseSchema = z.object({ source: knowledgeSourceSchema });
export type AddKnowledgeResponse = z.infer<typeof addKnowledgeResponseSchema>;

// POST /api/projects/:id/knowledge/upload-url (SB-T06)
// The client declares the file it's about to upload; the server checks the extension, the
// declared size, and the plan's source limit, reserves the source, and returns a one-time signed
// upload URL for that exact path. The browser then PUTs the file straight to Storage.
export const requestKnowledgeUploadRequestSchema = z.object({
  fileName: z.string().trim().min(1),
  size: z.number().int().positive(),
  title: title.optional(),
});
export type RequestKnowledgeUploadRequest = z.infer<typeof requestKnowledgeUploadRequestSchema>;
export const requestKnowledgeUploadResponseSchema = z.object({
  source: knowledgeSourceSchema,
  path: z.string(),
  token: z.string(),
});
export type RequestKnowledgeUploadResponse = z.infer<typeof requestKnowledgeUploadResponseSchema>;

// POST /api/projects/:id/knowledge/finalize (SB-T06)
// Called once the browser's PUT to the signed URL succeeds. The server checks the object's real
// size and (for a PDF) its magic bytes, deletes the object and the source if either fails, and
// otherwise starts processing. Response is the same shape as the text path's.
export const finalizeKnowledgeUploadRequestSchema = z.object({ sourceId: z.uuid() });
export type FinalizeKnowledgeUploadRequest = z.infer<typeof finalizeKnowledgeUploadRequestSchema>;

// DELETE /api/knowledge/:id
export const deleteKnowledgeResponseSchema = deleteResponseSchema;
export type DeleteKnowledgeResponse = DeleteResponse;
