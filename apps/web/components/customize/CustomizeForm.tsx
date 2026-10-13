"use client";

import {
  WIDGET_ANIMATIONS,
  WIDGET_DEFAULTS,
  type Plan,
  type WidgetConfig,
} from "@askwell/shared";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { saveWidgetConfig } from "../../lib/data/config-actions";
import { DemoBadge } from "../project-shell/DemoBadge";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, FOCUS, INPUT } from "../projects/styles";
import { buildChanges, isHexColor, validateDraft, type FieldErrors } from "./changes";
import { WidgetPreview } from "./WidgetPreview";

const POSITION_LABEL: Record<WidgetConfig["position"], string> = {
  "top-left": "Top left",
  "top-right": "Top right",
  "bottom-left": "Bottom left",
  "bottom-right": "Bottom right",
};
// Laid out like the corners of a page: top row first.
const POSITION_ORDER = ["top-left", "top-right", "bottom-left", "bottom-right"] as const satisfies readonly WidgetConfig["position"][];
const ANIMATION_LABEL: Record<WidgetConfig["animation"], string> = { fade: "Fade", slide: "Slide", scale: "Scale" };

type Props = { projectId: string; plan: Plan; initialConfig: WidgetConfig };

export function CustomizeForm({ projectId, plan, initialConfig }: Props) {
  const locked = plan !== "pro";
  const [saved, setSaved] = useState(initialConfig);
  const [draft, setDraft] = useState(initialConfig);
  // The color text box can hold an unfinished value; the preview keeps the last valid one.
  const [colorText, setColorText] = useState(initialConfig.buttonColor);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const saving = status === "saving";
  const changes = buildChanges(saved, draft);
  const dirty = Object.keys(changes).length > 0 || colorText !== draft.buttonColor;

  const update = <K extends keyof WidgetConfig>(key: K, value: WidgetConfig[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setStatus("idle");
  };

  const setColor = (value: string) => {
    setColorText(value);
    setStatus("idle");
    if (isHexColor(value)) {
      update("buttonColor", value.toLowerCase());
    } else {
      setErrors((current) => ({ ...current, buttonColor: "Use a 6-digit hex color, like #4f46e5." }));
    }
  };

  async function save(event: FormEvent) {
    event.preventDefault();
    if (locked) return;
    const found = validateDraft({ ...draft, buttonColor: colorText });
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setStatus("saving");
    try {
      const { config } = await saveWidgetConfig(projectId, saved, changes);
      setSaved(config);
      setDraft(config);
      setColorText(config.buttonColor);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  function discard() {
    setDraft(saved);
    setColorText(saved.buttonColor);
    setErrors({});
    setStatus("idle");
  }

  const describedBy = (key: keyof WidgetConfig, help?: string) =>
    [help, errors[key] ? `${key}-error` : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <form onSubmit={save} noValidate className="space-y-6">
        {locked && (
          <div className="rounded-xl border border-[#F2A33C] bg-[#FFF8EC] p-5">
            <p className="font-medium text-[#161A24]">Customizing the widget is a Pro feature</p>
            <p className="mt-1 text-sm text-[#5C4A26]">
              On Free, your widget uses the default look and shows the &quot;Powered by&quot; badge. Upgrade
              to change the color, position, label, animation and header, and to hide the badge.
            </p>
            <Link href="/dashboard/billing" className={`mt-4 inline-block ${BUTTON_PRIMARY}`}>
              Upgrade to Pro
            </Link>
          </div>
        )}

        {/* Locked on Free; also locked while saving, so edits made mid-save can't be
            overwritten when the response comes back. */}
        <fieldset disabled={locked || saving} aria-busy={saving} className={`space-y-6 ${locked ? "disabled:opacity-60" : ""}`}>
          <legend className="sr-only">Widget settings</legend>

          <div>
            <label htmlFor="buttonColor" className="block text-sm font-medium text-[#161A24]">
              Button color
            </label>
            <div className="mt-1 flex items-center gap-3">
              <input
                type="color"
                aria-label="Pick a button color"
                value={draft.buttonColor}
                onChange={(event) => setColor(event.target.value)}
                className={`h-10 w-12 cursor-pointer rounded-md border border-[#CBD2DE] bg-white p-1 disabled:cursor-not-allowed ${FOCUS}`}
              />
              <input
                id="buttonColor"
                value={colorText}
                onChange={(event) => setColor(event.target.value.trim())}
                maxLength={7}
                spellCheck={false}
                aria-invalid={Boolean(errors.buttonColor)}
                aria-describedby={describedBy("buttonColor")}
                className={`w-32 font-mono ${INPUT}`}
              />
              <ResetButton
                visible={!locked && draft.buttonColor !== WIDGET_DEFAULTS.buttonColor}
                onClick={() => setColor(WIDGET_DEFAULTS.buttonColor)}
              />
            </div>
            <FieldError id="buttonColor-error" message={errors.buttonColor} />
          </div>

          <fieldset>
            <legend className="text-sm font-medium text-[#161A24]">Position</legend>
            <div className="mt-2 grid max-w-xs grid-cols-2 gap-2">
              {POSITION_ORDER.map((position) => (
                <Choice
                  key={position}
                  name="position"
                  label={POSITION_LABEL[position]}
                  checked={draft.position === position}
                  onChange={() => update("position", position)}
                />
              ))}
            </div>
          </fieldset>

          <TextField
            id="label"
            label="Button label"
            value={draft.label}
            max={40}
            error={errors.label}
            describedBy={describedBy("label")}
            onChange={(value) => update("label", value)}
            onReset={!locked && draft.label !== WIDGET_DEFAULTS.label ? () => update("label", WIDGET_DEFAULTS.label) : null}
          />

          <fieldset>
            <legend className="text-sm font-medium text-[#161A24]">Open animation</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {WIDGET_ANIMATIONS.map((animation) => (
                <Choice
                  key={animation}
                  name="animation"
                  label={ANIMATION_LABEL[animation]}
                  checked={draft.animation === animation}
                  onChange={() => update("animation", animation)}
                />
              ))}
            </div>
          </fieldset>

          <TextField
            id="headerText"
            label="Header text"
            value={draft.headerText}
            max={60}
            error={errors.headerText}
            describedBy={describedBy("headerText")}
            onChange={(value) => update("headerText", value)}
            onReset={
              !locked && draft.headerText !== WIDGET_DEFAULTS.headerText
                ? () => update("headerText", WIDGET_DEFAULTS.headerText)
                : null
            }
          />

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={draft.showBadge}
              onChange={(event) => update("showBadge", event.target.checked)}
              className={`mt-0.5 h-4 w-4 accent-[#161A24] ${FOCUS}`}
            />
            <span>
              <span className="block text-sm font-medium text-[#161A24]">Show &quot;Powered by&quot; badge</span>
              <span className="block text-sm text-[#70788D]">The small credit line under the chat.</span>
            </span>
          </label>
        </fieldset>

        {!locked && (
          <div className="flex flex-wrap items-center gap-3 border-t border-[#D7DCE6] pt-5">
            <button type="submit" disabled={!dirty || saving} className={BUTTON_PRIMARY}>
              {saving ? "Saving…" : "Save changes"}
            </button>
            {dirty && (
              <button type="button" onClick={discard} disabled={saving} className={BUTTON_SECONDARY}>
                Discard changes
              </button>
            )}
            <span aria-live="polite" className="text-sm">
              {status === "saved" && <span className="text-[#067647]">Saved</span>}
              {status === "error" && <span className="text-[#B42318]">Changes weren&apos;t saved. Try again.</span>}
            </span>
            <span className="ml-auto">
              <DemoBadge />
            </span>
          </div>
        )}
      </form>

      <div className="xl:sticky xl:top-8 xl:self-start">
        <WidgetPreview config={{ ...draft, buttonColor: isHexColor(colorText) ? colorText.toLowerCase() : draft.buttonColor }} />
      </div>
    </div>
  );
}

function Choice({ name, label, checked, onChange }: { name: string; label: string; checked: boolean; onChange: () => void }) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm has-[:disabled]:cursor-not-allowed has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[#F2A33C] ${
        checked ? "border-[#161A24] bg-white font-medium text-[#161A24]" : "border-[#CBD2DE] bg-white/60 text-[#3D4456]"
      }`}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="accent-[#161A24]" />
      {label}
    </label>
  );
}

function TextField(props: {
  id: "label" | "headerText";
  label: string;
  value: string;
  max: number;
  error?: string;
  describedBy?: string;
  onChange: (value: string) => void;
  onReset: (() => void) | null;
}) {
  return (
    <div>
      <label htmlFor={props.id} className="block text-sm font-medium text-[#161A24]">
        {props.label}
      </label>
      <div className="mt-1 flex items-center gap-3">
        <input
          id={props.id}
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          maxLength={props.max}
          aria-invalid={Boolean(props.error)}
          aria-describedby={props.describedBy}
          className={`min-w-0 flex-1 ${INPUT}`}
        />
        <ResetButton visible={Boolean(props.onReset)} onClick={() => props.onReset?.()} />
      </div>
      <FieldError id={`${props.id}-error`} message={props.error} />
    </div>
  );
}

function ResetButton({ visible, onClick }: { visible: boolean; onClick: () => void }) {
  if (!visible) return null;
  return (
    <button type="button" onClick={onClick} className={`shrink-0 text-sm text-[#70788D] underline underline-offset-4 hover:text-[#161A24] ${FOCUS}`}>
      Reset to default
    </button>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-sm text-[#B42318]">
      {message}
    </p>
  );
}
