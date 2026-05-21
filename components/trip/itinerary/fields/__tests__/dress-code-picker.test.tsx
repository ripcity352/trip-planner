/**
 * Tests for `components/trip/itinerary/fields/dress-code-picker.tsx`.
 *
 * TDD RED phase: written before implementation.
 *
 * Responsibilities under test:
 *   1. Renders all 8 chips from the voice-locked DRESS_CODE_CHIPS array.
 *   2. Voice snapshot guard — chip labels exact-match the locked array.
 *   3. Single-select toggle: click chip → selected; click same chip → cleared.
 *   4. Mutual exclusivity: chip selected then freeform typed → chip cleared.
 *   5. Mutual exclusivity reverse: freeform typed then chip clicked → freeform cleared.
 *   6. Freeform fallback value persists across re-renders.
 *   7. No "Athleisure" chip — verifies the W0a voice lock holds.
 *   8. Tap target ≥44px via min-h class on chip buttons.
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import * as React from "react";

import { DressCodePicker } from "@/components/trip/itinerary/fields/dress-code-picker";
import { DRESS_CODE_CHIPS } from "@/lib/data/dress-codes";

describe("<DressCodePicker />", () => {
  // ── 1. Renders all 8 chips ────────────────────────────────────────────────

  it("renders all 8 chips from DRESS_CODE_CHIPS", () => {
    render(<DressCodePicker onChange={vi.fn()} />);

    for (const label of DRESS_CODE_CHIPS) {
      expect(
        screen.getByRole("button", { name: label })
      ).toBeInTheDocument();
    }
  });

  // ── 2. Voice snapshot guard ───────────────────────────────────────────────

  it("chip labels exact-match the locked DRESS_CODE_CHIPS array (voice guard)", () => {
    render(<DressCodePicker onChange={vi.fn()} />);

    const chipButtons = screen.getAllByRole("button").filter((btn) =>
      DRESS_CODE_CHIPS.includes(
        btn.textContent as (typeof DRESS_CODE_CHIPS)[number]
      )
    );

    const renderedLabels = chipButtons.map((btn) => btn.textContent);

    // Every locked chip must appear exactly once.
    expect(renderedLabels).toHaveLength(DRESS_CODE_CHIPS.length);
    for (const chip of DRESS_CODE_CHIPS) {
      expect(renderedLabels).toContain(chip);
    }
  });

  // ── 3. Single-select toggle ───────────────────────────────────────────────

  it("clicking a chip calls onChange with the chip text", () => {
    const onChange = vi.fn();
    render(<DressCodePicker onChange={onChange} />);

    const chip = screen.getByRole("button", { name: "Loud shirts" });
    fireEvent.click(chip);

    expect(onChange).toHaveBeenCalledWith("Loud shirts");
  });

  it("clicking the same selected chip again clears the value", () => {
    const onChange = vi.fn();
    render(<DressCodePicker onChange={onChange} value="Loud shirts" />);

    const chip = screen.getByRole("button", { name: "Loud shirts" });
    fireEvent.click(chip);

    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("selected chip has aria-pressed=true; others have aria-pressed=false", () => {
    render(<DressCodePicker onChange={vi.fn()} value="Pool casual" />);

    expect(
      screen.getByRole("button", { name: "Pool casual" })
    ).toHaveAttribute("aria-pressed", "true");

    expect(
      screen.getByRole("button", { name: "Loud shirts" })
    ).toHaveAttribute("aria-pressed", "false");
  });

  // ── 4. Mutual exclusivity: chip then freeform ─────────────────────────────

  it("typing in freeform calls onChange with the typed text and clears chip selection", () => {
    const onChange = vi.fn();
    // Start with a chip selected.
    render(<DressCodePicker onChange={onChange} value="Costume" />);

    const freeformInput = screen.getByRole("textbox");
    fireEvent.change(freeformInput, { target: { value: "Custom vibe" } });

    // onChange called with the freeform text, not the previous chip value.
    expect(onChange).toHaveBeenCalledWith("Custom vibe");
  });

  it("after typing in freeform the previously-selected chip is no longer pressed", () => {
    // Controlled component: simulate parent updating value after freeform input.
    const { rerender } = render(
      <DressCodePicker onChange={vi.fn()} value="Costume" />
    );

    // Parent updates value to the freeform string after freeform change.
    rerender(<DressCodePicker onChange={vi.fn()} value="Custom vibe" />);

    // "Costume" is not in DRESS_CODE_CHIPS as "Custom vibe", so no chip pressed.
    expect(
      screen.getByRole("button", { name: "Costume" })
    ).toHaveAttribute("aria-pressed", "false");
  });

  // ── 5. Mutual exclusivity reverse: freeform then chip ────────────────────

  it("clicking a chip when freeform has text calls onChange with chip text", () => {
    const onChange = vi.fn();
    // Simulate a freeform value already set.
    render(<DressCodePicker onChange={onChange} value="My custom code" />);

    const chip = screen.getByRole("button", { name: "Sneakers OK" });
    fireEvent.click(chip);

    expect(onChange).toHaveBeenCalledWith("Sneakers OK");
  });

  it("freeform input is cleared (empty string) when a chip is clicked", () => {
    const { rerender } = render(
      <DressCodePicker onChange={vi.fn()} value="My custom code" />
    );

    // After chip click, parent sets value to chip text.
    rerender(
      <DressCodePicker onChange={vi.fn()} value="Sneakers OK" />
    );

    const freeformInput = screen.getByRole("textbox");
    // Freeform reflects only non-chip values; chip value means freeform = empty.
    expect(freeformInput).toHaveValue("");
  });

  // ── 6. Freeform value persists across re-renders ──────────────────────────

  it("freeform value is preserved across re-renders when a non-chip string is set", () => {
    const { rerender } = render(
      <DressCodePicker onChange={vi.fn()} value="Smart casual" />
    );

    rerender(<DressCodePicker onChange={vi.fn()} value="Smart casual" />);

    const freeformInput = screen.getByRole("textbox");
    expect(freeformInput).toHaveValue("Smart casual");
  });

  // ── 7. No "Athleisure" assertion (W0a voice lock) ─────────────────────────

  it('does NOT render an "Athleisure" chip (banned by voice-lock W0a)', () => {
    render(<DressCodePicker onChange={vi.fn()} />);

    // Should not find any button whose label is "Athleisure".
    const buttons = screen.queryAllByRole("button");
    const labels = buttons.map((b) => b.textContent);
    expect(labels).not.toContain("Athleisure");
  });

  // ── 8. Tap target ≥44px ───────────────────────────────────────────────────

  it("each chip button has a min-h class ensuring ≥44px tap target", () => {
    render(<DressCodePicker onChange={vi.fn()} />);

    for (const label of DRESS_CODE_CHIPS) {
      const chip = screen.getByRole("button", { name: label });
      // Component must apply a min-h class of at least 44px (min-h-11 = 44px in Tailwind).
      expect(chip.className).toMatch(/min-h-\[44px\]|min-h-11/);
    }
  });
});
