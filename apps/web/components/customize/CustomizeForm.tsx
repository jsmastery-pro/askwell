"use client";

import {
  APP_NAME,
  WIDGET_ANIMATIONS,
  WIDGET_HEADER_TEXT_MAX_LENGTH,
  WIDGET_LABEL_MAX_LENGTH,
  type Plan,
  type WidgetSettings,
} from "@askwell/shared";
import { useId, useReducer, type ReactNode } from "react";
import { inputClasses, messageClasses } from "../projects/fields";
import { Button, GlassPanel } from "../ui";
import { cx } from "../ui/cx";
import { saveWidgetConfig } from "./api";
import {
  changedFields,
  customizeReducer,
  fieldErrors,
  initialState,
  previewConfig,
  type CustomizeState,
} from "./form";
import { WidgetPreview } from "./WidgetPreview";

const POSITION_LABELS: Record<WidgetSettings["position"], string> = {
  "top-left": "Top left",
  "top-right": "Top right",
  "bottom-left": "Bottom left",
  "bottom-right": "Bottom right",
};
// Grid order: top row, then bottom row.
const POSITION_ORDER = ["top-left", "top-right", "bottom-left", "bottom-right"] as const satisfies readonly WidgetSettings["position"][];

const ANIMATION_LABELS: Record<WidgetSettings["animation"], string> = {
  fade: "Fade",
  slide: "Slide",
  scale: "Scale",
};

export interface CustomizeFormProps {
  projectId: string;
  /** The stored config, read on the server (owner client). */
  stored: WidgetSettings;
  /** The owner's plan, read on the server. The route's 402 is the real gate. */
  plan: Plan;
  /** Start from this state (tests). */
  initial?: CustomizeState;
}

/** Shown above a locked form: customizing is Pro-only (§5). */
export function UpgradePrompt() {
  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-control border border-line-strong bg-glass p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-sm text-fg">
        Customizing the widget is a Pro feature. Your widget uses the default look until you upgrade.
      </p>
      <Button href="/dashboard/billing" size="sm" className="self-start sm:self-auto">
        Upgrade to Pro
      </Button>
    </div>
  );
}

function Field({ label, htmlFor, hint, error, children }: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-sm text-fg-muted">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-xs text-fg">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-fg-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

const choiceClasses =
  "flex h-10 cursor-pointer items-center justify-center rounded-control border border-line-strong bg-glass px-3 text-sm text-fg-muted " +
  "transition-colors has-[:checked]:border-primary has-[:checked]:font-medium has-[:checked]:text-fg " +
  "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50";

/** The Customize page: the form (locked unless Pro) and the live preview. */
export function CustomizeForm({ projectId, stored, plan, initial }: CustomizeFormProps) {
  const [state, dispatch] = useReducer(customizeReducer, initial ?? initialState(stored, plan));
  const ids = { color: useId(), hex: useId(), label: useId(), header: useId(), badge: useId() };
  const { draft, locked, status } = state;
  const errors = fieldErrors(draft);
  const changes = changedFields(state.stored, draft);
  const dirty = Object.keys(changes).length > 0;
  const canSave = !locked && dirty && Object.keys(errors).length === 0 && status.kind !== "saving";
  const validColor = /^#[0-9a-fA-F]{6}$/.test(draft.button_color);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!canSave) return;
    dispatch({ type: "saving" });
    const result = await saveWidgetConfig(projectId, changes);
    dispatch(result.ok ? { type: "saved", config: result.data } : { type: "failed", error: result.error });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-fg">Customize</h2>
        <p className="text-sm text-fg-muted">How the chat button and panel look on your site.</p>
      </div>

      {locked ? <UpgradePrompt /> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <GlassPanel className="min-w-0">
          <form onSubmit={save} noValidate aria-label="Widget settings" className="flex flex-col gap-5">
            <fieldset disabled={locked} className="m-0 flex min-w-0 flex-col gap-5 border-0 p-0">
              <Field label="Button color" htmlFor={ids.hex} error={errors.button_color}>
                <div className="flex items-center gap-2">
                  <input
                    id={ids.color}
                    type="color"
                    aria-label="Pick a button color"
                    value={validColor ? draft.button_color.toLowerCase() : "#000000"}
                    onChange={(e) => dispatch({ type: "set", field: "button_color", value: e.target.value })}
                    className="h-10 w-12 shrink-0 cursor-pointer rounded-control border border-line-strong bg-glass p-1 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <input
                    id={ids.hex}
                    value={draft.button_color}
                    maxLength={7}
                    spellCheck={false}
                    autoComplete="off"
                    aria-invalid={errors.button_color ? true : undefined}
                    aria-describedby={errors.button_color ? `${ids.hex}-error` : undefined}
                    onChange={(e) => dispatch({ type: "set", field: "button_color", value: e.target.value.trim() })}
                    className={cx(inputClasses, "font-mono")}
                  />
                </div>
              </Field>

              <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
                <legend className="mb-1 text-sm text-fg-muted">Position</legend>
                <div className="grid grid-cols-2 gap-2">
                  {POSITION_ORDER.map((position) => (
                    <label key={position} className={choiceClasses}>
                      <input
                        type="radio"
                        name="position"
                        value={position}
                        checked={draft.position === position}
                        onChange={() => dispatch({ type: "set", field: "position", value: position })}
                        className="sr-only"
                      />
                      {POSITION_LABELS[position]}
                    </label>
                  ))}
                </div>
              </fieldset>

              <Field
                label="Button label"
                htmlFor={ids.label}
                error={errors.label}
                hint={`${draft.label.length} / ${WIDGET_LABEL_MAX_LENGTH}`}
              >
                <input
                  id={ids.label}
                  value={draft.label}
                  maxLength={WIDGET_LABEL_MAX_LENGTH}
                  aria-invalid={errors.label ? true : undefined}
                  aria-describedby={errors.label ? `${ids.label}-error` : undefined}
                  onChange={(e) => dispatch({ type: "set", field: "label", value: e.target.value })}
                  className={inputClasses}
                />
              </Field>

              <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
                <legend className="mb-1 text-sm text-fg-muted">Open animation</legend>
                <div className="grid grid-cols-3 gap-2">
                  {WIDGET_ANIMATIONS.map((animation) => (
                    <label key={animation} className={choiceClasses}>
                      <input
                        type="radio"
                        name="animation"
                        value={animation}
                        checked={draft.animation === animation}
                        onChange={() => dispatch({ type: "set", field: "animation", value: animation })}
                        className="sr-only"
                      />
                      {ANIMATION_LABELS[animation]}
                    </label>
                  ))}
                </div>
              </fieldset>

              <Field
                label="Panel header"
                htmlFor={ids.header}
                error={errors.header_text}
                hint={`${draft.header_text.length} / ${WIDGET_HEADER_TEXT_MAX_LENGTH}`}
              >
                <input
                  id={ids.header}
                  value={draft.header_text}
                  maxLength={WIDGET_HEADER_TEXT_MAX_LENGTH}
                  aria-invalid={errors.header_text ? true : undefined}
                  aria-describedby={errors.header_text ? `${ids.header}-error` : undefined}
                  onChange={(e) => dispatch({ type: "set", field: "header_text", value: e.target.value })}
                  className={inputClasses}
                />
              </Field>

              <label htmlFor={ids.badge} className="flex cursor-pointer items-center gap-3 text-sm text-fg has-[:disabled]:cursor-not-allowed">
                <input
                  id={ids.badge}
                  type="checkbox"
                  checked={locked ? true : draft.show_badge}
                  onChange={(e) => dispatch({ type: "set", field: "show_badge", value: e.target.checked })}
                  className="size-4 accent-primary disabled:opacity-50"
                />
                Show “Powered by {APP_NAME}”
              </label>
            </fieldset>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" loading={status.kind === "saving"} disabled={!canSave}>
                {status.kind === "saving" ? "Saving…" : "Save"}
              </Button>
              {!locked && dirty && status.kind !== "saving" ? (
                <Button type="button" variant="ghost" onClick={() => dispatch({ type: "reset" })}>
                  Discard changes
                </Button>
              ) : null}
            </div>
            {status.kind === "saved" ? (
              <p role="status" className={messageClasses}>
                Saved. Your widget shows the new look on the next page load.
              </p>
            ) : null}
            {status.kind === "error" ? (
              <p role="alert" className={messageClasses}>
                {status.message}
              </p>
            ) : null}
          </form>
        </GlassPanel>

        <GlassPanel className="min-w-0">
          <WidgetPreview config={previewConfig(state, plan)} />
        </GlassPanel>
      </div>
    </div>
  );
}
