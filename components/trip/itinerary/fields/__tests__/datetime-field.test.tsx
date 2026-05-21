/**
 * Unit tests for DatetimeField sub-component.
 *
 * TDD: written before implementation.
 * This is a pre-split refactor — zero behavior change from edit-item-form.tsx.
 * The field covers the "Starts" / day input that W2b (datetime) will later enrich.
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DatetimeField } from "../datetime-field";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";

describe("DatetimeField", () => {
  it("renders a label with the starts string", () => {
    render(<DatetimeField value="" onChange={vi.fn()} disabled={false} error={undefined} />);
    expect(screen.getByText(M3_UI_STRINGS.itineraryForm_starts_label)).toBeInTheDocument();
  });

  it("renders a date input", () => {
    render(<DatetimeField value="" onChange={vi.fn()} disabled={false} error={undefined} />);
    // date inputs don't get the textbox role — use querySelector
    const input = screen.getByDisplayValue("") as HTMLInputElement;
    expect(input.type).toBe("date");
  });

  it("displays the current value", () => {
    render(<DatetimeField value="2026-07-04" onChange={vi.fn()} disabled={false} error={undefined} />);
    const input = document.querySelector('input[type="date"]') as HTMLInputElement;
    expect(input.value).toBe("2026-07-04");
  });

  it("calls onChange when user picks a date", () => {
    const onChange = vi.fn();
    render(<DatetimeField value="" onChange={onChange} disabled={false} error={undefined} />);
    const input = document.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2026-08-15" } });
    expect(onChange).toHaveBeenCalledWith("2026-08-15");
  });

  it("disables the input when disabled=true", () => {
    render(<DatetimeField value="" onChange={vi.fn()} disabled={true} error={undefined} />);
    const input = document.querySelector('input[type="date"]') as HTMLInputElement;
    expect(input).toBeDisabled();
  });

  it("renders an error message when error is provided", () => {
    render(<DatetimeField value="" onChange={vi.fn()} disabled={false} error="Invalid date" />);
    expect(screen.getByText("Invalid date")).toBeInTheDocument();
  });

  it("does not render an error element when error is undefined", () => {
    render(<DatetimeField value="" onChange={vi.fn()} disabled={false} error={undefined} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
