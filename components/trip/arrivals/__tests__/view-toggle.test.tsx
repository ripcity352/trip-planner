/**
 * Unit tests for ViewToggle (#579) — the Compact | Full density switch.
 *
 * It's the SINGLE density control for the arrivals manifest (no per-row
 * expand). Two buttons with aria-pressed reflecting the active view — the
 * same content at two densities, so a toggle-button group (not tabs).
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { ViewToggle } from "../view-toggle";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";

describe("ViewToggle", () => {
  it("renders both options with an accessible group label", () => {
    render(<ViewToggle value="compact" onChange={() => {}} />);
    expect(
      screen.getByRole("group", { name: M3_UI_STRINGS.arrivals_view_toggle_label })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: M3_UI_STRINGS.arrivals_view_toggle_compact,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: M3_UI_STRINGS.arrivals_view_toggle_full,
      })
    ).toBeInTheDocument();
  });

  it("marks the active view with aria-pressed", () => {
    render(<ViewToggle value="compact" onChange={() => {}} />);
    expect(
      screen.getByRole("button", {
        name: M3_UI_STRINGS.arrivals_view_toggle_compact,
      })
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", {
        name: M3_UI_STRINGS.arrivals_view_toggle_full,
      })
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("calls onChange with the other view when the inactive option is tapped", () => {
    const onChange = vi.fn();
    render(<ViewToggle value="compact" onChange={onChange} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: M3_UI_STRINGS.arrivals_view_toggle_full,
      })
    );
    expect(onChange).toHaveBeenCalledWith("full");
  });

  it("still calls onChange when the already-active option is tapped (idempotent select)", () => {
    const onChange = vi.fn();
    render(<ViewToggle value="full" onChange={onChange} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: M3_UI_STRINGS.arrivals_view_toggle_full,
      })
    );
    expect(onChange).toHaveBeenCalledWith("full");
  });
});
