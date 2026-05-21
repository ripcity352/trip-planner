/**
 * Unit tests for DatetimeField (W2b updated shim).
 *
 * The shim now wraps DateTimeLocalFieldImpl, rendering a datetime-local
 * input in the trip's timezone. Tests verify the shim's label, delegation,
 * and error forwarding.
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DatetimeField } from "../datetime-field";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";

describe("DatetimeField", () => {
  it("renders a label with the starts string", () => {
    render(
      <DatetimeField
        value={null}
        onChange={vi.fn()}
        disabled={false}
        tripTimezone="UTC"
        error={undefined}
      />
    );
    expect(
      screen.getByText(M3_UI_STRINGS.itineraryForm_starts_label)
    ).toBeInTheDocument();
  });

  it("renders a datetime-local input (not plain date)", () => {
    render(
      <DatetimeField
        value={null}
        onChange={vi.fn()}
        disabled={false}
        tripTimezone="UTC"
      />
    );
    const input = document.querySelector(
      'input[type="datetime-local"]'
    ) as HTMLInputElement;
    expect(input).toBeInTheDocument();
  });

  it("displays the value formatted in tripTimezone", () => {
    // 2026-06-01T03:00:00Z = 2026-05-31T23:00 Eastern (EDT, UTC-4)
    render(
      <DatetimeField
        value="2026-06-01T03:00:00.000Z"
        onChange={vi.fn()}
        disabled={false}
        tripTimezone="America/New_York"
      />
    );
    const input = document.querySelector(
      'input[type="datetime-local"]'
    ) as HTMLInputElement;
    expect(input.value).toBe("2026-05-31T23:00");
  });

  it("calls onChange with UTC ISO when user picks a datetime", () => {
    const onChange = vi.fn();
    render(
      <DatetimeField
        value={null}
        onChange={onChange}
        disabled={false}
        tripTimezone="America/New_York"
      />
    );
    const input = document.querySelector(
      'input[type="datetime-local"]'
    ) as HTMLInputElement;
    // 23:00 EDT → UTC+4 = 03:00 next day
    fireEvent.change(input, { target: { value: "2026-05-31T23:00" } });
    expect(onChange).toHaveBeenCalledWith("2026-06-01T03:00:00.000Z");
  });

  it("calls onChange with null when input is cleared", () => {
    const onChange = vi.fn();
    render(
      <DatetimeField
        value="2026-06-01T03:00:00.000Z"
        onChange={onChange}
        disabled={false}
        tripTimezone="UTC"
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
      <DatetimeField
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

  it("renders an error message when error is provided", () => {
    render(
      <DatetimeField
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

  it("does not render an error element when error is undefined", () => {
    render(
      <DatetimeField
        value={null}
        onChange={vi.fn()}
        disabled={false}
        tripTimezone="UTC"
        error={undefined}
      />
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
