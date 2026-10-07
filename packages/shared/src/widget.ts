import { z } from "zod";
import { APP_NAME } from "./app";

export const WIDGET_POSITIONS = ["bottom-right", "bottom-left", "top-right", "top-left"] as const;
export const WIDGET_ANIMATIONS = ["fade", "slide", "scale"] as const;

export const MAX_CHAT_MESSAGE_LENGTH = 1000;

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex color, e.g. #4f46e5");

// Fully resolved config, as the widget renders it.
export const widgetConfigSchema = z.object({
  buttonColor: hexColor,
  position: z.enum(WIDGET_POSITIONS),
  label: z.string().min(1).max(40),
  animation: z.enum(WIDGET_ANIMATIONS),
  headerText: z.string().min(1).max(60),
  showBadge: z.boolean(),
});
export type WidgetConfig = z.infer<typeof widgetConfigSchema>;

// What Free gets, and what Pro falls back to for unset fields (null in the DB).
export const DEFAULT_WIDGET_CONFIG: WidgetConfig = {
  buttonColor: "#4f46e5",
  position: "bottom-right",
  label: "Chat with us",
  animation: "fade",
  headerText: `Ask ${APP_NAME}`,
  showBadge: true,
};

export const publicKeySchema = z.string().regex(/^pk_[A-Za-z0-9_-]+$/, "Invalid public key");

// GET /api/widget/config?key=
export const widgetConfigQuerySchema = z.object({ key: publicKeySchema });
export type WidgetConfigQuery = z.infer<typeof widgetConfigQuerySchema>;
export const widgetConfigResponseSchema = z.object({ config: widgetConfigSchema });
export type WidgetConfigResponse = z.infer<typeof widgetConfigResponseSchema>;

// POST /api/widget/chat
export const widgetChatRequestSchema = z.object({
  key: publicKeySchema,
  visitorId: z.string().min(1).max(100),
  conversationId: z.uuid().optional(),
  message: z.string().trim().min(1).max(MAX_CHAT_MESSAGE_LENGTH),
});
export type WidgetChatRequest = z.infer<typeof widgetChatRequestSchema>;
export const widgetChatResponseSchema = z.object({
  conversationId: z.uuid(),
  reply: z.string(),
});
export type WidgetChatResponse = z.infer<typeof widgetChatResponseSchema>;

// PATCH /api/projects/:id/config — Pro only (402 on Free). Send only the fields to change.
// null resets buttonColor, label or headerText to its default; the other fields reject null.
export const updateWidgetConfigRequestSchema = z
  .object({
    buttonColor: hexColor.nullable(),
    position: z.enum(WIDGET_POSITIONS),
    label: z.string().trim().min(1).max(40).nullable(),
    animation: z.enum(WIDGET_ANIMATIONS),
    headerText: z.string().trim().min(1).max(60).nullable(),
    showBadge: z.boolean(),
  })
  .partial();
export type UpdateWidgetConfigRequest = z.infer<typeof updateWidgetConfigRequestSchema>;
export const updateWidgetConfigResponseSchema = widgetConfigResponseSchema;
export type UpdateWidgetConfigResponse = WidgetConfigResponse;
