// Client-side file checks, for UX only: the upload-url route checks the
// declared size and extension, finalize checks the real ones (§9 "File upload").
import {
  ALLOWED_FILE_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  MAX_KNOWLEDGE_FILE_BYTES,
  fileExtension,
  isAllowedFileExtension,
  type AllowedFileExtension,
} from "@askwell/shared";

/** The file fields we read (a File, or a stand-in in tests). */
export type FileInfo = { name: string; size: number; type: string };

/** For the file input's `accept`: extensions plus their MIME types. */
export const FILE_ACCEPT = [
  ...ALLOWED_FILE_EXTENSIONS.map((ext) => `.${ext}`),
  ...new Set(Object.values(ALLOWED_MIME_TYPES).flat()),
].join(",");

const MAX_MB = MAX_KNOWLEDGE_FILE_BYTES / (1024 * 1024);

export const FILE_RULES_TEXT = `${ALLOWED_FILE_EXTENSIONS.map((ext) => ext.toUpperCase()).join(", ")}, up to ${MAX_MB} MB.`;

export type FileCheck =
  | { ok: true; ext: AllowedFileExtension; mimeType: string }
  | { ok: false; message: string };

/**
 * Checks a chosen file's extension and size, and picks the MIME type to
 * declare and upload with. Browsers often report "" (or something else) for
 * .md files, so a type that doesn't match the extension falls back to the
 * extension's first allowed type; finalize checks the real bytes anyway.
 */
export function checkFile(file: FileInfo): FileCheck {
  const ext = fileExtension(file.name);
  if (!isAllowedFileExtension(ext)) {
    return { ok: false, message: `That file type isn't supported. Use ${FILE_RULES_TEXT}` };
  }
  if (file.size <= 0) return { ok: false, message: "That file is empty." };
  if (file.size > MAX_KNOWLEDGE_FILE_BYTES) {
    return { ok: false, message: `That file is over ${MAX_MB} MB. Use ${FILE_RULES_TEXT}` };
  }
  const allowed: readonly string[] = ALLOWED_MIME_TYPES[ext];
  const mimeType = allowed.includes(file.type) ? file.type : (allowed[0] as string);
  return { ok: true, ext, mimeType };
}
