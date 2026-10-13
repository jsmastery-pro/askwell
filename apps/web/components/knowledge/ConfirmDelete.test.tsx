import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmDelete } from "./ConfirmDelete";

afterEach(cleanup);

function renderDialog() {
  const outside = document.createElement("button");
  outside.textContent = "Behind the dialog";
  document.body.append(outside);
  const onCancel = vi.fn();
  render(<ConfirmDelete title="Guide.pdf" isFile onCancel={onCancel} onConfirm={vi.fn()} />);
  return {
    onCancel,
    outside,
    cancel: screen.getByRole("button", { name: "Cancel" }),
    confirm: screen.getByRole("button", { name: "Delete" }),
  };
}

describe("ConfirmDelete", () => {
  it("opens with focus on Cancel", () => {
    const { cancel } = renderDialog();
    expect(document.activeElement).toBe(cancel);
  });

  it("keeps Tab and Shift+Tab inside the dialog", () => {
    const { cancel, confirm } = renderDialog();

    confirm.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(cancel);

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(confirm);
  });

  it("pulls focus back in if it ends up behind the dialog", () => {
    const { outside, cancel } = renderDialog();

    outside.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(cancel);
  });

  it("closes on Escape", () => {
    const { onCancel } = renderDialog();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
