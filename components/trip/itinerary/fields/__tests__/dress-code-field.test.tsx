/**
 * Tests for `components/trip/itinerary/fields/dress-code-field.tsx`.
 *
 * Verifies the form-field wrapper:
 *   1. Renders the label from M3_UI_STRINGS (no inline literals).
 *   2. Renders the DressCodePicker (chip grid + freeform input).
 *   3. Value prop flows down — chip is marked pressed when value matches.
 *   4. onChange propagates up from chip clicks.
 *   5. onChange propagates up from freeform input.
 *   6. Disabled state is passed through (chips and freeform disabled).
 *   7. Label is associated with the freeform input via htmlFor/id.
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { DressCodeField } from "@/components/trip/itinerary/fields/dress-code-field";
import { DRESS_CODE_CHIPS } from "@/lib/data/dress-codes";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";

describe("<DressCodeField />", () => {
  // ── 1. Label from copy palette ────────────────────────────────────────────

  it("renders the dress-code label from M3_UI_STRINGS (not an inline literal)", () => {
    render(<DressCodeField onChange={vi.fn()} />);

    expect(
      screen.getByText(M3_UI_STRINGS.itineraryForm_dress_label)
    ).toBeInTheDocument();
  });

  // ── 2. Chip picker is rendered ────────────────────────────────────────────

  it("renders all 8 dress-code chip buttons", () => {
    render(<DressCodeField onChange={vi.fn()} />);

    for (const chip of DRESS_CODE_CHIPS) {
      expect(screen.getByRole("button", { name: chip })).toBeInTheDocument();
    }
  });

  it("renders the freeform input", () => {
    render(<DressCodeField onChange={vi.fn()} />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  // ── 3. Value flows down — chip pressed state ──────────────────────────────

  it("chip matching value prop is aria-pressed=true", () => {
    render(<DressCodeField onChange={vi.fn()} value="Pool casual" />);

    expect(
      screen.getByRole("button", { name: "Pool casual" })
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("no chip is pressed when value is undefined", () => {
    render(<DressCodeField onChange={vi.fn()} />);

    for (const chip of DRESS_CODE_CHIPS) {
      expect(
        screen.getByRole("button", { name: chip })
      ).toHaveAttribute("aria-pressed", "false");
    }
  });

  it("freeform input shows value when it is not a chip label", () => {
    render(<DressCodeField onChange={vi.fn()} value="Smart casual" />);
    expect(screen.getByRole("textbox")).toHaveValue("Smart casual");
  });

  // ── 4. onChange from chip click ───────────────────────────────────────────

  it("chip click calls onChange with chip text", () => {
    const onChange = vi.fn();
    render(<DressCodeField onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Loud shirts" }));

    expect(onChange).toHaveBeenCalledWith("Loud shirts");
  });

  it("clicking selected chip calls onChange with undefined (deselect)", () => {
    const onChange = vi.fn();
    render(<DressCodeField onChange={onChange} value="Loud shirts" />);

    fireEvent.click(screen.getByRole("button", { name: "Loud shirts" }));

    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  // ── 5. onChange from freeform input ──────────────────────────────────────

  it("typing in freeform input calls onChange with the typed text", () => {
    const onChange = vi.fn();
    render(<DressCodeField onChange={onChange} />);

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Hawaiian chic" },
    });

    expect(onChange).toHaveBeenCalledWith("Hawaiian chic");
  });

  it("clearing freeform input calls onChange with undefined", () => {
    const onChange = vi.fn();
    render(<DressCodeField onChange={onChange} value="Hawaiian chic" />);

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "" },
    });

    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  // ── 6. Disabled state passthrough ────────────────────────────────────────

  it("all chips are disabled when disabled=true", () => {
    render(<DressCodeField onChange={vi.fn()} disabled />);

    for (const chip of DRESS_CODE_CHIPS) {
      expect(screen.getByRole("button", { name: chip })).toBeDisabled();
    }
  });

  it("freeform input is disabled when disabled=true", () => {
    render(<DressCodeField onChange={vi.fn()} disabled />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  // ── 7. Label associated with freeform input ───────────────────────────────

  it("label htmlFor links to the freeform input id", () => {
    render(<DressCodeField onChange={vi.fn()} />);

    const label = screen.getByText(M3_UI_STRINGS.itineraryForm_dress_label);
    const input = screen.getByRole("textbox");

    // The label's htmlFor must match the input's id.
    expect(label).toHaveAttribute("for", input.id);
    expect(input.id).toBeTruthy();
  });
});
