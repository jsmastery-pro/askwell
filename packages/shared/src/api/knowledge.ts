// Owner routes: knowledge sources (project.md §8, §6.4, §9 file rules).
import { z } from "zod";
import {
  ALLOWED_FILE_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  KNOWLEDGE_TITLE_MAX_LENGTH,
  MAX_KNOWLEDGE_FILE_BYTES,
  MAX_PASTED_TEXT_LENGTH,
  type AllowedFileExtension,
} from "../limits";
import type { KnowledgeSource } from "../models";
import { idSchema } from "./common";

/** The lower-case extension of a file name, or null if it has none. */
export function fileExtension(fileName: string): string | null {
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0 || dot === fileName.length - 1) return null;
  return fileName.slice(dot + 1).toLowerCase();
}

export function isAllowedFileExtension(ext: string | null): ext is AllowedFileExtension {
  return ext !== null && (ALLOWED_FILE_EXTENSIONS as readonly string[]).includes(ext);
}

const knowledgeTitleSchema = z.string().trim().min(1).max(KNOWLEDGE_TITLE_MAX_LENGTH);

// POST /api/projects/:id/knowledge (params: idParams). Paste text.
export const createTextSourceBody = z.strictObject({
  title: knowledgeTitleSchema,
  text: z.string().trim().min(1).max(MAX_PASTED_TEXT_LENGTH),
});
export type CreateTextSourceBody = z.infer<typeof createTextSourceBody>;
export type CreateTextSourceResponse = { source: KnowledgeSource };

// POST /api/projects/:id/knowledge/upload-url (params: idParams).
// Checks the declared size and extension; the real ones are checked at finalize.
export const createUploadUrlBody = z
  .strictObject({
    fileName: z.string().trim().min(1).max(KNOWLEDGE_TITLE_MAX_LENGTH),
    sizeBytes: z.number().int().positive().max(MAX_KNOWLEDGE_FILE_BYTES),
    mimeType: z.string().min(1),
  })
  .superRefine((body, ctx) => {
    const ext = fileExtension(body.fileName);
    if (!isAllowedFileExtension(ext)) {
      ctx.addIssue({
        code: "custom",
        path: ["fileName"],
        message: `Allowed file types: ${ALLOWED_FILE_EXTENSIONS.join(", ")}`,
      });
      return;
    }
    if (!(ALLOWED_MIME_TYPES[ext] as readonly string[]).includes(body.mimeType)) {
      ctx.addIssue({
        code: "custom",
        path: ["mimeType"],
        message: `MIME type does not match a .${ext} file`,
      });
    }
  });
export type CreateUploadUrlBody = z.infer<typeof createUploadUrlBody>;
export type CreateUploadUrlResponse = {
  /** The reserved source, status "uploading". */
  source: KnowledgeSource;
  /** One-time signed upload, for supabase-js `uploadToSignedUrl(path, token, file)`. */
  upload: {
    path: string;
    token: string;
    signedUrl: string;
  };
};

// POST /api/projects/:id/knowledge/finalize (params: idParams)
export const finalizeUploadBody = z.strictObject({
  sourceId: idSchema,
});
export type FinalizeUploadBody = z.infer<typeof finalizeUploadBody>;
export type FinalizeUploadResponse = { source: KnowledgeSource };

// DELETE /api/knowledge/:id (params: idParams) → DeletedResponse
