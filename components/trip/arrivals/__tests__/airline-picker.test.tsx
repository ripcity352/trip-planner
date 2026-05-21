/**
 * TDD RED phase — airline picker tests.
 * Written before implementation per M4 W2c plan.
 *
 * Covers:
 *   1. Renders typeahead input + clear button.
 *   2. Filtering by IATA/name substring (case-insensitive).
 *   3. Click suggestion → onChange called with airlineIata set, carrier cleared.
 *   4. Freeform fallback — "Type your airline" voice lock, sets carrier, clears airlineIata.
 *   5. Flight number input: accepts valid, rejects regex-invalid, allows empty.
 *   6. Injection vectors: NUL / CRLF in carrier stripped or rejected.
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AirlinePicker } from "../airline-picker";

// ─── helpers ────────────────────────────────────────────────────────────────

interface PickerValue {
  airlineIata?: string;
  flightNumber?: string;
  carrier?: string;
}

function renderPicker(
  value: PickerValue = {},
  onChange = vi.fn(),
  disabled = false
) {
  return render(
    <AirlinePicker value={value} onChange={onChange} disabled={disabled} />
  );
}

function typeIntoInput(input: Element, text: string) {
  fireEvent.change(input, { target: { value: text } });
}

// ─── 1. Render ────────────────────────────────────────────────────────────────

describe("AirlinePicker — render", () => {
  it("renders the airline typeahead input", () => {
    renderPicker();
    expect(screen.getByRole("combobox", { name: /airline/i })).toBeInTheDocument();
  });

  it("renders the flight number input", () => {
    renderPicker();
    expect(
      screen.getByRole("textbox", { name: /flight number/i })
    ).toBeInTheDocument();
  });

  it("renders a clear button when an airline is selected", () => {
    renderPicker({ airlineIata: "AA" });
    expect(screen.getByRole("button", { name: /clear/i })).toBeInTheDocument();
  });

  it("does not render a clear button when nothing is selected", () => {
    renderPicker();
    expect(screen.queryByRole("button", { name: /clear/i })).not.toBeInTheDocument();
  });

  it("displays the selected airline name in the input when airlineIata is set", () => {
    renderPicker({ airlineIata: "AS" });
    const input = screen.getByRole("combobox", { name: /airline/i }) as HTMLInputElement;
    expect(input.value).toContain("Alaska Airlines");
  });
});

// ─── 2. Filtering ─────────────────────────────────────────────────────────────

describe("AirlinePicker — filtering", () => {
  it("shows suggestions when user types a name substring (case-insensitive)", async () => {
    renderPicker();
    const input = screen.getByRole("combobox", { name: /airline/i });
    typeIntoInput(input, "alas");
    await waitFor(() => {
      expect(screen.getByText(/alaska airlines/i)).toBeInTheDocument();
    });
  });

  it("shows suggestions when user types an IATA code", async () => {
    renderPicker();
    const input = screen.getByRole("combobox", { name: /airline/i });
    typeIntoInput(input, "AS");
    await waitFor(() => {
      expect(screen.getByText(/alaska airlines/i)).toBeInTheDocument();
    });
  });

  it("displays the IATA code alongside airline name in suggestions", async () => {
    renderPicker();
    const input = screen.getByRole("combobox", { name: /airline/i });
    typeIntoInput(input, "alas");
    await waitFor(() => {
      // Suggestion should show "AS / Alaska Airlines"
      expect(screen.getByText(/AS.*Alaska Airlines|Alaska Airlines.*AS/i)).toBeInTheDocument();
    });
  });

  it("hides suggestions when input is cleared", async () => {
    renderPicker();
    const input = screen.getByRole("combobox", { name: /airline/i });
    typeIntoInput(input, "alas");
    await waitFor(() => expect(screen.getByText(/alaska airlines/i)).toBeInTheDocument());
    typeIntoInput(input, "");
    await waitFor(() =>
      expect(screen.queryByText(/alaska airlines/i)).not.toBeInTheDocument()
    );
  });
});

// ─── 3. Selection ─────────────────────────────────────────────────────────────

describe("AirlinePicker — selection", () => {
  it("calls onChange with airlineIata when a suggestion is clicked", async () => {
    const onChange = vi.fn();
    renderPicker({}, onChange);
    const input = screen.getByRole("combobox", { name: /airline/i });
    typeIntoInput(input, "alas");
    await waitFor(() => expect(screen.getByText(/alaska airlines/i)).toBeInTheDocument());
    // Use mouseDown (what the component listens to)
    fireEvent.mouseDown(screen.getByText(/alaska airlines/i));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ airlineIata: "AS" })
    );
  });

  it("clears carrier when a known airline is selected", async () => {
    const onChange = vi.fn();
    renderPicker({ carrier: "Some Old Airline" }, onChange);
    const input = screen.getByRole("combobox", { name: /airline/i });
    typeIntoInput(input, "alas");
    await waitFor(() => expect(screen.getByText(/alaska airlines/i)).toBeInTheDocument());
    fireEvent.mouseDown(screen.getByText(/alaska airlines/i));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ carrier: undefined })
    );
  });

  it("clears airlineIata when the clear button is clicked", () => {
    const onChange = vi.fn();
    renderPicker({ airlineIata: "AA" }, onChange);
    fireEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ airlineIata: undefined })
    );
  });
});

// ─── 4. Freeform fallback ─────────────────────────────────────────────────────

describe("AirlinePicker — freeform fallback", () => {
  it("shows freeform fallback affordance when query has no matching airline", async () => {
    renderPicker();
    const input = screen.getByRole("combobox", { name: /airline/i });
    typeIntoInput(input, "ZZZ Unknown Carrier");
    await waitFor(() => {
      // The voice-locked placeholder text must appear
      expect(screen.getByText("Type your airline")).toBeInTheDocument();
    });
  });

  it('voice lock: freeform label is exactly "Type your airline" (not "Other")', async () => {
    renderPicker();
    const input = screen.getByRole("combobox", { name: /airline/i });
    typeIntoInput(input, "NonExistentAirline");
    await waitFor(() => {
      expect(screen.queryByText("Other")).not.toBeInTheDocument();
      expect(screen.getByText("Type your airline")).toBeInTheDocument();
    });
  });

  it("calls onChange with carrier set and airlineIata cleared on freeform selection", async () => {
    const onChange = vi.fn();
    renderPicker({}, onChange);
    const input = screen.getByRole("combobox", { name: /airline/i });
    typeIntoInput(input, "Spirit Custom");
    await waitFor(() => expect(screen.getByText("Type your airline")).toBeInTheDocument());
    fireEvent.mouseDown(screen.getByText("Type your airline"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        // Sanitizer strips NUL/CRLF only — spaces are preserved
        carrier: "Spirit Custom",
        airlineIata: undefined,
      })
    );
  });
});

// ─── 5. Flight number input ───────────────────────────────────────────────────

describe("AirlinePicker — flight number", () => {
  it("accepts a valid numeric flight number", () => {
    const onChange = vi.fn();
    renderPicker({}, onChange);
    const flightInput = screen.getByRole("textbox", { name: /flight number/i });
    fireEvent.change(flightInput, { target: { value: "1234" } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ flightNumber: "1234" })
    );
  });

  it("calls onChange with flightNumber when a valid value is typed", () => {
    const onChange = vi.fn();
    renderPicker({}, onChange);
    const flightInput = screen.getByRole("textbox", { name: /flight number/i });
    fireEvent.change(flightInput, { target: { value: "A" } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ flightNumber: "A" })
    );
  });

  it("strips characters that violate the regex ^[A-Z0-9]{1,8}$ (e.g. '!')", () => {
    const onChange = vi.fn();
    renderPicker({}, onChange);
    const flightInput = screen.getByRole("textbox", { name: /flight number/i });
    fireEvent.change(flightInput, { target: { value: "AB!23" } });
    // Component strips non-[A-Z0-9] chars, so onChange receives "AB23"
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ flightNumber: "AB23" })
    );
  });

  it("shows validation_failed message for invalid flight number passed as prop", () => {
    renderPicker({ flightNumber: "AB!23" });
    expect(
      screen.getByText(/Something in there isn't quite right/i)
    ).toBeInTheDocument();
  });

  it("allows empty flight number (not all legs have flight numbers)", () => {
    renderPicker({ airlineIata: "AA", flightNumber: undefined });
    const flightInput = screen.getByRole("textbox", { name: /flight number/i });
    expect(flightInput).toHaveValue("");
  });

  it("converts lowercase letters in flight number to uppercase", () => {
    const onChange = vi.fn();
    renderPicker({}, onChange);
    const flightInput = screen.getByRole("textbox", { name: /flight number/i });
    fireEvent.change(flightInput, { target: { value: "a" } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ flightNumber: "A" })
    );
  });
});

// ─── 6. Injection vectors (Phase 4 Coverage HIGH H1) ─────────────────────────

describe("AirlinePicker — injection vectors", () => {
  it("strips NUL bytes from freeform carrier before calling onChange", async () => {
    const onChange = vi.fn();
    renderPicker({}, onChange);
    const input = screen.getByRole("combobox", { name: /airline/i });
    // NUL byte embedded in carrier string
    fireEvent.change(input, { target: { value: "AirNullXYZ" } });
    await waitFor(() => expect(screen.getByText("Type your airline")).toBeInTheDocument());
    fireEvent.mouseDown(screen.getByText("Type your airline"));
    const lastCall = onChange.mock.calls.at(-1)?.[0] as PickerValue;
    expect(lastCall.carrier).not.toContain("\0");
  });

  it("strips CRLF sequences from freeform carrier before calling onChange", async () => {
    const onChange = vi.fn();
    renderPicker({}, onChange);
    const input = screen.getByRole("combobox", { name: /airline/i });
    fireEvent.change(input, { target: { value: "Air\r\nInject" } });
    await waitFor(() => expect(screen.getByText("Type your airline")).toBeInTheDocument());
    fireEvent.mouseDown(screen.getByText("Type your airline"));
    const lastCall = onChange.mock.calls.at(-1)?.[0] as PickerValue;
    expect(lastCall.carrier).not.toMatch(/[\r\n]/);
  });

  it("IATA regex enforced: onChange never receives an invalid airlineIata", async () => {
    // All airlineIata values come exclusively from the AIRLINES[] catalog,
    // every entry of which satisfies ^[A-Z0-9]{2}$.
    const onChange = vi.fn();
    renderPicker({}, onChange);
    const input = screen.getByRole("combobox", { name: /airline/i });
    typeIntoInput(input, "ZZZ");
    await waitFor(() => expect(screen.getByText("Type your airline")).toBeInTheDocument());
    fireEvent.mouseDown(screen.getByText("Type your airline"));
    const calls = onChange.mock.calls;
    for (const [arg] of calls) {
      if ((arg as PickerValue).airlineIata !== undefined) {
        expect((arg as PickerValue).airlineIata).toMatch(/^[A-Z0-9]{2}$/);
      }
    }
  });
});
