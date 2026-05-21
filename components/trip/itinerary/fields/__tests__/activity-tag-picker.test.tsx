/**
 * TDD tests for ActivityTagPicker — multi-select chip picker with freeform fallback.
 * Written RED-first before implementation.
 *
 * Voice constraint: seed chips must be neutral (Phase 2 Voice CRITICAL C2).
 * No bach-coded seeds; freeform input handles those as escape valve.
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ActivityTagPicker } from "../activity-tag-picker";
import { ACTIVITY_TAG_CHIPS } from "@/lib/data/activity-tags";

const BANNED_TERMS = ["strip", "bachelor", "bachelorette", "penis", "dick"];

function renderPicker(value: string[] = [], onChange = vi.fn(), disabled = false) {
  return render(
    <ActivityTagPicker value={value} onChange={onChange} disabled={disabled} />
  );
}

describe("ActivityTagPicker", () => {
  // ── 1. Renders all 9 seed chips ──────────────────────────────────────────
  it("renders all 9 seed chips from ACTIVITY_TAG_CHIPS", () => {
    renderPicker();
    for (const chip of ACTIVITY_TAG_CHIPS) {
      expect(screen.getByRole("button", { name: chip })).toBeInTheDocument();
    }
  });

  // ── 2. Voice snapshot guard — neutral seeds only ──────────────────────────
  it("voice snapshot: renders exactly the 9 neutral seed chips", () => {
    renderPicker();
    const chipTexts = ACTIVITY_TAG_CHIPS.map(
      (chip) => screen.getByRole("button", { name: chip }).textContent
    );
    expect(chipTexts).toEqual([...ACTIVITY_TAG_CHIPS]);
  });

  // ── 3. Multi-select add: clicking a chip calls onChange with it added ─────
  it("adds a chip to value when clicked", () => {
    const onChange = vi.fn();
    renderPicker([], onChange);

    fireEvent.click(screen.getByRole("button", { name: "meal" }));
    expect(onChange).toHaveBeenLastCalledWith(["meal"]);
  });

  it("adds a second chip while preserving first", () => {
    const onChange = vi.fn();
    renderPicker(["meal"], onChange);

    fireEvent.click(screen.getByRole("button", { name: "bar" }));
    expect(onChange).toHaveBeenLastCalledWith(["meal", "bar"]);
  });

  // ── 4. Multi-select remove: click selected chip → removed from value ──────
  it("removes a chip from value when clicked while selected", () => {
    const onChange = vi.fn();
    renderPicker(["meal", "bar"], onChange);

    fireEvent.click(screen.getByRole("button", { name: "meal" }));
    expect(onChange).toHaveBeenLastCalledWith(["bar"]);
  });

  // ── 5. Freeform tag append via Enter ──────────────────────────────────────
  it("appends a freeform tag when Enter is pressed", () => {
    const onChange = vi.fn();
    render(<ActivityTagPicker value={["meal"]} onChange={onChange} />);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "spa-day" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    expect(onChange).toHaveBeenLastCalledWith(["meal", "spa-day"]);
  });

  // ── 5b. Freeform tag append via blur ──────────────────────────────────────
  it("appends a freeform tag on blur if input has value", () => {
    const onChange = vi.fn();
    render(<ActivityTagPicker value={[]} onChange={onChange} />);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "rooftop" } });
    fireEvent.blur(input);

    expect(onChange).toHaveBeenLastCalledWith(["rooftop"]);
  });

  // ── 5c. Does not append blank freeform tags ────────────────────────────────
  it("does not append empty or whitespace-only freeform tags", () => {
    const onChange = vi.fn();
    render(<ActivityTagPicker value={[]} onChange={onChange} />);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    expect(onChange).not.toHaveBeenCalled();
  });

  // ── 5d. Clears the freeform input after appending ─────────────────────────
  it("clears the freeform input after a tag is appended via Enter", () => {
    const onChange = vi.fn();
    render(<ActivityTagPicker value={[]} onChange={onChange} />);

    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "spa-day" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    expect(input.value).toBe("");
  });

  // ── 6. Freeform tag remove via × affordance ────────────────────────────────
  it("removes a custom freeform tag via its × button", () => {
    const onChange = vi.fn();
    render(
      <ActivityTagPicker value={["meal", "spa-day"]} onChange={onChange} />
    );

    const removeBtn = screen.getByRole("button", { name: /remove spa-day/i });
    fireEvent.click(removeBtn);

    expect(onChange).toHaveBeenLastCalledWith(["meal"]);
  });

  // ── 7. Negative: no seed chip matches banned terms ────────────────────────
  it.each(BANNED_TERMS)(
    "no seed chip case-insensitively matches banned term '%s'",
    (banned) => {
      renderPicker();
      const chipButtons = screen
        .getAllByRole("button")
        .map((b) => b.textContent ?? "");
      const hasBanned = chipButtons.some((text) =>
        text.toLowerCase().includes(banned.toLowerCase())
      );
      expect(hasBanned).toBe(false);
    }
  );

  // ── 8. Mixed: seed chip + freeform tag coexist ───────────────────────────
  it("renders both seed chip selections and custom freeform tags simultaneously", () => {
    render(
      <ActivityTagPicker value={["bar", "rooftop"]} onChange={vi.fn()} />
    );

    expect(screen.getByRole("button", { name: "bar" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(
      screen.getByRole("button", { name: /remove rooftop/i })
    ).toBeInTheDocument();
  });

  // ── 9. Seed chips expose aria-pressed for selected state ─────────────────
  it("marks selected seed chips with aria-pressed=true and others false", () => {
    render(
      <ActivityTagPicker value={["outdoor", "chill"]} onChange={vi.fn()} />
    );

    expect(screen.getByRole("button", { name: "outdoor" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: "chill" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: "meal" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  // ── 10. Disabled prop disables all interactive elements ──────────────────
  it("disables chip buttons and freeform input when disabled prop is true", () => {
    renderPicker([], vi.fn(), true);

    for (const chip of ACTIVITY_TAG_CHIPS) {
      expect(screen.getByRole("button", { name: chip })).toBeDisabled();
    }
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  // ── 11. Does not add duplicate freeform tags ─────────────────────────────
  it("does not duplicate a freeform tag already in value", () => {
    const onChange = vi.fn();
    render(<ActivityTagPicker value={["spa-day"]} onChange={onChange} />);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "spa-day" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    expect(onChange).not.toHaveBeenCalled();
  });
});
