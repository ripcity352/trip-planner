/**
 * Unit tests for ActivityTagField — wrapper around ActivityTagPicker.
 * Updated for W1b chip-picker render (was freeform input in W0d).
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ActivityTagField } from "../activity-tag-field";
import { ACTIVITY_TAG_CHIPS } from "@/lib/data/activity-tags";

function renderField(
  value: string[] = [],
  onChange = vi.fn(),
  disabled = false
) {
  return render(
    <ActivityTagField value={value} onChange={onChange} disabled={disabled} />
  );
}

describe("ActivityTagField", () => {
  it("renders seed chip buttons via ActivityTagPicker", () => {
    renderField();
    for (const chip of ACTIVITY_TAG_CHIPS) {
      expect(screen.getByRole("button", { name: chip })).toBeInTheDocument();
    }
  });

  it("renders a freeform text input", () => {
    renderField();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("calls onChange when a seed chip is clicked", () => {
    const onChange = vi.fn();
    renderField([], onChange);

    fireEvent.click(screen.getByRole("button", { name: "club" }));
    expect(onChange).toHaveBeenCalledWith(["club"]);
  });

  it("passes disabled to the picker", () => {
    renderField([], vi.fn(), true);

    for (const chip of ACTIVITY_TAG_CHIPS) {
      expect(screen.getByRole("button", { name: chip })).toBeDisabled();
    }
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("reflects the current value array as selected chips", () => {
    renderField(["outdoor", "pool"]);

    expect(screen.getByRole("button", { name: "outdoor" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: "pool" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: "spa" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });
});
