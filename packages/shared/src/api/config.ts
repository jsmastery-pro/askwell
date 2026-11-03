// Owner route: widget customization (project.md §8, §6.8). Free → 402 on the server.
import { z } from "zod";
import type { WidgetConfig } from "../models";
import {
  hexColorSchema,
  widgetAnimationSchema,
  widgetHeaderTextSchema,
  widgetLabelSchema,
  widgetPositionSchema,
} from "./common";

// PATCH /api/projects/:id/config (params: idParams). Send only the fields that change.
export const updateWidgetConfigBody = z
  .strictObject({
    button_color: hexColorSchema,
    position: widgetPositionSchema,
    label: widgetLabelSchema,
    animation: widgetAnimationSchema,
    header_text: widgetHeaderTextSchema,
    show_badge: z.boolean(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, "Send at least one field");
export type UpdateWidgetConfigBody = z.infer<typeof updateWidgetConfigBody>;
export type UpdateWidgetConfigResponse = { config: WidgetConfig };
