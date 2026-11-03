// Public routes, called by the widget from any origin (project.md §8, §6.5, §6.6).
import { z } from "zod";
import { MAX_MESSAGE_LENGTH } from "../limits";
import type { WidgetSettings } from "../widget";
import { idSchema, publicKeySchema, visitorIdSchema } from "./common";

// GET /api/widget/config?key=pk_...
export const widgetConfigQuery = z.strictObject({
  key: publicKeySchema,
});
export type WidgetConfigQuery = z.infer<typeof widgetConfigQuery>;
/** The config with the plan applied: Free gets the defaults and the badge. */
export type WidgetConfigResponse = { config: WidgetSettings };

// POST /api/widget/chat
export const widgetChatBody = z.strictObject({
  key: publicKeySchema,
  visitorId: visitorIdSchema,
  /** Omitted on the first message; the server creates the conversation. */
  conversationId: idSchema.optional(),
  message: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
});
export type WidgetChatBody = z.infer<typeof widgetChatBody>;
export type WidgetChatResponse = {
  conversationId: string;
  reply: string;
};
