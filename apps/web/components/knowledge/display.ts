// Words for the knowledge page: status badges, type names, the source count
// and limit prompt, and error messages. Limits come from PLAN_LIMITS.
import {
  KNOWLEDGE_TITLE_MAX_LENGTH,
  MAX_PASTED_TEXT_LENGTH,
  PLAN_LIMITS,
  type KnowledgeSourceStatus,
  type KnowledgeSourceType,
  type Plan,
} from "@askwell/shared";
import type { ApiFailure } from "../projects/api";
import type { LimitPrompt } from "../projects/limit";
import type { UploadResult, UploadStep } from "./upload";

export type StatusTone = "pending" | "ready" | "failed";

/**
 * `uploading` is a reservation whose finalize never ran (the page reloaded or
 * the network dropped mid-upload): "Upload not finished", with Finish (§6.4).
 * `inFlight`: this page's own upload is still sending it, so it's "Uploading…".
 */
export function statusView(status: KnowledgeSourceStatus, inFlight = false): { label: string; tone: StatusTone } {
  switch (status) {
    case "uploading":
      return { label: inFlight ? "Uploading…" : "Upload not finished", tone: "pending" };
    case "processing":
      return { label: "Processing", tone: "pending" };
    case "ready":
      return { label: "Ready", tone: "ready" };
    case "failed":
      return { label: "Failed", tone: "failed" };
  }
}

export const TYPE_LABELS: Record<KnowledgeSourceType, string> = {
  text: "Pasted text",
  pdf: "PDF",
  md: "Markdown",
  txt: "Text file",
};

const sources = (n: number) => `${n} source${n === 1 ? "" : "s"}`;

/** "2 of 3 sources". */
export function sourceCountText(count: number, limit: number): string {
  return `${count} of ${sources(limit)}`;
}

/** Why the add actions are off at the plan's source limit. */
export function knowledgeLimitPrompt(plan: Plan): LimitPrompt {
  if (plan === "free") {
    return {
      message: `Free includes ${sources(PLAN_LIMITS.free.knowledgeSources)} per project. Delete one to add another, or upgrade to Pro for ${PLAN_LIMITS.pro.knowledgeSources}.`,
      upgrade: true,
    };
  }
  return {
    message: `Pro includes ${sources(PLAN_LIMITS.pro.knowledgeSources)} per project. Delete one to add another.`,
    upgrade: false,
  };
}

/** A failed add (text or file), in words. Switches on the §8 code, never the status. */
export function addErrorText(error: ApiFailure, kind: "text" | "file"): string {
  switch (error.code) {
    case "plan_limit_reached":
      return "This project is at its source limit. Delete a source to add another.";
    case "unauthorized":
      return "Your session ended. Sign in again.";
    case "not_found":
      return "This project no longer exists. Reload the page.";
    case "validation_failed":
      return kind === "text"
        ? `Use a title of up to ${KNOWLEDGE_TITLE_MAX_LENGTH} characters and text of up to ${MAX_PASTED_TEXT_LENGTH.toLocaleString("en-US")} characters.`
        : error.message;
    default:
      return kind === "text" ? "Couldn't add the text. Try again." : "Couldn't upload the file. Try again.";
  }
}

/** A failed delete, in words. */
export function deleteErrorText(error: ApiFailure): string {
  switch (error.code) {
    case "not_found":
      return "This source no longer exists. Refresh the list.";
    case "unauthorized":
      return "Your session ended. Sign in again.";
    default:
      return "Couldn't delete the source. Try again.";
  }
}

/** A Finish that changed nothing (server, network or session error), in words. */
export function finishErrorText(error: ApiFailure): string {
  switch (error.code) {
    case "unauthorized":
      return "Your session ended. Sign in again.";
    default:
      return "Couldn't finish the upload. Try again.";
  }
}

/** What the upload button says while a step runs. */
export const UPLOAD_STEP_LABELS: Record<UploadStep, string> = {
  check: "Checking…",
  reserve: "Preparing…",
  upload: "Uploading…",
  finalize: "Processing…",
};

export type UploadFailureView = {
  text: string;
  /** Something changed on the server (a source row may be listed now): refresh the list. */
  refresh: boolean;
  /** Offer "Retry" for finalize with this source id (only after a server or network error). */
  retrySourceId: string | null;
};

/** How to show a failed upload. */
export function uploadFailureView(result: Extract<UploadResult, { ok: false }>): UploadFailureView {
  const text = addErrorText(result.error, "file");
  switch (result.step) {
    case "check":
    case "reserve":
      return { text, refresh: false, retrySourceId: null };
    case "upload":
      return {
        text: result.pendingSourceId ? `${text} Delete the pending source below.` : text,
        refresh: true,
        retrySourceId: null,
      };
    case "finalize":
      // A refused file (validation_failed etc.) is final; a server or network
      // error may not be, and the claim may have gone through, so retry with
      // the same id rather than delete.
      return {
        text,
        refresh: true,
        retrySourceId: result.error.code === "internal" ? result.pendingSourceId : null,
      };
  }
}
