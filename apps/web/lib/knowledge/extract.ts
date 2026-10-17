import "server-only";
import { extractText, getDocumentProxy } from "unpdf";

/** PDF magic bytes, checked before trusting an upload's extension (project.md §9 File upload). */
export function hasPdfMagicBytes(buffer: Buffer): boolean {
  return buffer.subarray(0, 5).toString("utf-8") === "%PDF-";
}

/** Raw text for an uploaded file: PDF via `unpdf`, MD/TXT read as UTF-8. */
export async function extractFileText(type: "pdf" | "md" | "txt", buffer: Buffer): Promise<string> {
  if (type !== "pdf") return buffer.toString("utf-8");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}
