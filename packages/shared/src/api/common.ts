// Building blocks shared by the route schemas.
import { z } from "zod";
import { WIDGET_ANIMATIONS, WIDGET_POSITIONS } from "../enums";
import {
  PROJECT_NAME_MAX_LENGTH,
  PROJECT_NAME_MIN_LENGTH,
  PUBLIC_KEY_MAX_LENGTH,
  PUBLIC_KEY_PREFIX,
  VISITOR_ID_MAX_LENGTH,
  WIDGET_HEADER_TEXT_MAX_LENGTH,
  WIDGET_LABEL_MAX_LENGTH,
} from "../limits";

/** A row id (uuid). */
export const idSchema = z.uuid();

/** Route params for `/:id` routes. */
export const idParams = z.strictObject({ id: idSchema });
export type IdParams = z.infer<typeof idParams>;

/** A project's public key: "pk_" + letters, digits, "_" or "-". */
export const publicKeySchema = z
  .string()
  .max(PUBLIC_KEY_MAX_LENGTH)
  .regex(new RegExp(`^${PUBLIC_KEY_PREFIX}[A-Za-z0-9_-]+$`), "Invalid public key");

/** The random visitor ID the panel keeps in localStorage. */
export const visitorIdSchema = z
  .string()
  .min(1)
  .max(VISITOR_ID_MAX_LENGTH)
  .regex(/^[A-Za-z0-9_-]+$/, "Invalid visitor ID");

export const projectNameSchema = z
  .string()
  .trim()
  .min(PROJECT_NAME_MIN_LENGTH)
  .max(PROJECT_NAME_MAX_LENGTH);

/** A 6-digit hex color, e.g. "#1a2b3c". */
export const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #1a2b3c");

export const widgetPositionSchema = z.enum(WIDGET_POSITIONS);
export const widgetAnimationSchema = z.enum(WIDGET_ANIMATIONS);
export const widgetLabelSchema = z.string().trim().min(1).max(WIDGET_LABEL_MAX_LENGTH);
export const widgetHeaderTextSchema = z.string().trim().min(1).max(WIDGET_HEADER_TEXT_MAX_LENGTH);

/** Response of DELETE routes. */
export type DeletedResponse = { id: string };
