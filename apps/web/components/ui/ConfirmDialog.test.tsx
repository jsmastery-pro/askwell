import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";

afterEach(cleanup);

function renderDialog() {
  const outside = document.createElement("button");
  outside.textContent = "Behind the dialog";
  document.body.append(outside);
  const onCancel = vi.fn();
  render(
    <ConfirmDialog
      title="Delete Guide.pdf?"
      body="The file is removed."
      confirmLabel="Delete"
      onCancel={onCancel}
      onConfirm={vi.fn()}
    />,
  );
  return {
    onCancel,
    outside,
    cancel: screen.getByRole("button", { name: "Cancel" }),
    confirm: screen.getByRole("button", { name: "Delete" }),
  };
}

describe("ConfirmDialog", () => {
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

  it("names the dialog by its title and body", () => {
    renderDialog();
    const dialog = screen.getByRole("alertdialog", { name: "Delete Guide.pdf?" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.getElementById(dialog.getAttribute("aria-describedby")!)!.textContent).toBe("The file is removed.");
  });

  it("closes on Escape", () => {
    const { onCancel } = renderDialog();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
