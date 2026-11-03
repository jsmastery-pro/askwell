// Input limits (project.md §6.4, §6.6, §9).

/** Max characters in one visitor message. */
export const MAX_MESSAGE_LENGTH = 1000;

/** Max characters in one pasted knowledge text. */
export const MAX_PASTED_TEXT_LENGTH = 50_000;

/** Max knowledge file size: 10 MB. The Storage bucket enforces the same. */
export const MAX_KNOWLEDGE_FILE_BYTES = 10 * 1024 * 1024;
/** Alias of MAX_KNOWLEDGE_FILE_BYTES (the name used in the task brief). */
export const MAX_FILE_BYTES = MAX_KNOWLEDGE_FILE_BYTES;

/** Allowed knowledge file extensions, lower case, without the dot. */
export const ALLOWED_FILE_EXTENSIONS = ["pdf", "md", "txt"] as const;
export type AllowedFileExtension = (typeof ALLOWED_FILE_EXTENSIONS)[number];

/** Allowed MIME types per extension. Browsers report Markdown in several ways. */
export const ALLOWED_MIME_TYPES = {
  pdf: ["application/pdf"],
  md: ["text/markdown", "text/x-markdown", "text/plain"],
  txt: ["text/plain"],
} as const satisfies Record<AllowedFileExtension, readonly string[]>;

/** Every allowed MIME type, for the Storage bucket's allow list. */
export const ALLOWED_FILE_MIME_TYPES = [
  ...new Set(Object.values(ALLOWED_MIME_TYPES).flat()),
] as readonly string[];

export const PROJECT_NAME_MIN_LENGTH = 1;
export const PROJECT_NAME_MAX_LENGTH = 60;

export const KNOWLEDGE_TITLE_MAX_LENGTH = 200;
export const WIDGET_LABEL_MAX_LENGTH = 40;
export const WIDGET_HEADER_TEXT_MAX_LENGTH = 80;

/** Public keys are "pk_" + a random string. */
export const PUBLIC_KEY_PREFIX = "pk_";
export const PUBLIC_KEY_MAX_LENGTH = 128;

export const VISITOR_ID_MAX_LENGTH = 100;
