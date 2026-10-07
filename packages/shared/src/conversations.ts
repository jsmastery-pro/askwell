import { z } from "zod";

export const MESSAGE_ROLES = ["visitor", "bot"] as const;

export const messageSchema = z.object({
  id: z.uuid(),
  role: z.enum(MESSAGE_ROLES),
  body: z.string(),
  createdAt: z.iso.datetime(),
});
export type Message = z.infer<typeof messageSchema>;

export const conversationSummarySchema = z.object({
  id: z.uuid(),
  visitorId: z.string(),
  preview: z.string(),
  messageCount: z.number().int(),
  createdAt: z.iso.datetime(),
});
export type ConversationSummary = z.infer<typeof conversationSummarySchema>;

// GET /api/projects/:id/conversations — newest first
export const listConversationsResponseSchema = z.object({
  conversations: z.array(conversationSummarySchema),
});
export type ListConversationsResponse = z.infer<typeof listConversationsResponseSchema>;

// GET /api/conversations/:id
export const getConversationResponseSchema = z.object({
  conversation: z.object({
    id: z.uuid(),
    visitorId: z.string(),
    createdAt: z.iso.datetime(),
    messages: z.array(messageSchema),
  }),
});
export type GetConversationResponse = z.infer<typeof getConversationResponseSchema>;
