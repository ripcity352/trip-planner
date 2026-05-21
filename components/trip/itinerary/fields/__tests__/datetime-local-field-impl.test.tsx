/**
 * TDD RED — written before implementation of datetime-local-field-impl.tsx.
 *
 * Covers:
 *   1. Renders an input of type="datetime-local"
 *   2. Value is formatted in tripTimezone (not raw UTC)
 *   3. onChange propagates UTC ISO when user changes the input
 *   4. Invalid datetime string → onChange called with null
 *   5. Disabled state passes through to the native input
 *   6. Cross-coast: same UTC value renders different local display values for
 *      different tripTimezones (H1: never trust client TZ)
 *   7. Renders error message when error prop is provided
 *   8. Does not render error when error is undefined
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DateTimeLocalFieldImpl } from "../datetime-local-field-impl";

// A fixed UTC timestamp used across tests.
const UTC_ISO = "2026-08-15T18:00:00.000Z";

describe("DateTimeLocalFieldImpl", () => {
  it("renders a native datetime-local input", () => {
    render(
      <DateTimeLocalFieldImpl
        value={UTC_ISO}
        onChange={vi.fn()}
        disabled={false}
        tripTimezone="America/New_York"
      />
    );
    const input = document.querySelector(
      'input[type="datetime-local"]'
    ) as HTMLInputElement;
    expect(input).toBeInTheDocument();
  });

  it("displays value formatted in tripTimezone (America/New_York, EDT = UTC-4)", () => {
    // 2026-08-15T18:00Z = 2026-08-15T14:00 EDT
    render(
      <DateTimeLocalFieldImpl
        value={UTC_ISO}
        onChange={vi.fn()}
        disabled={false}
        tripTimezone="America/New_York"
      />
    );
    const input = document.querySelector(
      'input[type="datetime-local"]'
    ) as HTMLInputElement;
    expect(input.value).toBe("2026-08-15T14:00");
  });

  it("propagates UTC ISO string when user changes input", () => {
    const onChange = vi.fn();
    render(
      <DateTimeLocalFieldImpl
        value={null}
        onChange={onChange}
        disabled={false}
        tripTimezone="America/New_York"
      />
    );
    const input = document.querySelector(
      'input[type="datetime-local"]'
    ) as HTMLInputElement;
    // User picks 2026-05-31T23:00 in EDT → should emit 2026-06-01T03:00:00.000Z
    fireEvent.change(input, { target: { value: "2026-05-31T23:00" } });
    expect(onChange).toHaveBeenCalledWith("2026-06-01T03:00:00.000Z");
  });

  it("calls onChange with null when input is cleared (empty string)", () => {
    const onChange = vi.fn();
    render(
      <DateTimeLocalFieldImpl
        value={UTC_ISO}
        onChange={onChange}
        disabled={false}
        tripTimezone="America/New_York"
      />
    );
    const input = document.querySelector(
      'input[type="datetime-local"]'
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("disables the input when disabled=true", () => {
    render(
      <DateTimeLocalFieldImpl
        value={null}
        onChange={vi.fn()}
        disabled={true}
        tripTimezone="UTC"
      />
    );
    const input = document.querySelector(
      'input[type="datetime-local"]'
    ) as HTMLInputElement;
    expect(input).toBeDisabled();
  });

  it("cross-coast: same UTC renders different local value for Pacific vs Eastern", () => {
    const { rerender } = render(
      <DateTimeLocalFieldImpl
        value={UTC_ISO}
        onChange={vi.fn()}
        disabled={false}
        tripTimezone="America/New_York"
      />
    );
    const getInputValue = () =>
      (document.querySelector(
        'input[type="datetime-local"]'
      ) as HTMLInputElement).value;

    const easternValue = getInputValue(); // 14:00

    rerender(
      <DateTimeLocalFieldImpl
        value={UTC_ISO}
        onChange={vi.fn()}
        disabled={false}
        tripTimezone="America/Los_Angeles"
      />
    );
    const pacificValue = getInputValue(); // 11:00

    expect(easternValue).toBe("2026-08-15T14:00");
    expect(pacificValue).toBe("2026-08-15T11:00");
    expect(easternValue).not.toBe(pacificValue);
  });

  it("renders error message when error prop is provided", () => {
    render(
      <DateTimeLocalFieldImpl
        value={null}
        onChange={vi.fn()}
        disabled={false}
        tripTimezone="UTC"
        error="That doesn't look like a real time."
      />
    );
    expect(
      screen.getByText("That doesn't look like a real time.")
    ).toBeInTheDocument();
  });

  it("does not render error element when error is undefined", () => {
    render(
      <DateTimeLocalFieldImpl
        value={null}
        onChange={vi.fn()}
        disabled={false}
        tripTimezone="UTC"
      />
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders empty input when value is null", () => {
    render(
      <DateTimeLocalFieldImpl
        value={null}
        onChange={vi.fn()}
        disabled={false}
        tripTimezone="America/New_York"
      />
    );
    const input = document.querySelector(
      'input[type="datetime-local"]'
    ) as HTMLInputElement;
    expect(input.value).toBe("");
  });
});
