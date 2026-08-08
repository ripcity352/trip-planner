/**
 * Regression tests for #543 — AirlinePicker + react-hook-form Controller
 * integration.
 *
 * The existing `airline-picker.test.tsx` suite renders AirlinePicker
 * against a plain `useState`/`vi.fn()` harness. That harness cannot
 * reproduce #543: a plain useState correctly handles both `""` and
 * `undefined`, but RHF's `Controller.onChange(undefined)` reverts the
 * field to `defaultValues` instead of clearing it.
 *
 * This suite renders AirlinePicker through the SAME triple-nested
 * Controller wiring used in `travel-leg-form.tsx` (~lines 315-348), with
 * non-empty `defaultValues`, so that a regression of the `... ||
 * undefined` clearing pattern is caught.
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useForm, Controller, type Control } from "react-hook-form";
import { AirlinePicker } from "../airline-picker";

interface FormValues {
  airlineIata?: string;
  flightNumber?: string;
  carrier?: string;
}

// Mirrors travel-leg-form.tsx's triple-nested Controller wiring exactly,
// including the onChange fan-out that calls all three field.onChange
// functions and the `next.carrier !== undefined` guard on the carrier leg.
function AirlinePickerHarness({ control }: { control: Control<FormValues> }) {
  return (
    <Controller
      name="airlineIata"
      control={control}
      render={({ field: airlineField }) => (
        <Controller
          name="flightNumber"
          control={control}
          render={({ field: flightField }) => (
            <Controller
              name="carrier"
              control={control}
              render={({ field: carrierField }) => (
                <AirlinePicker
                  value={{
                    airlineIata: airlineField.value,
                    flightNumber: flightField.value,
                    carrier: carrierField.value,
                  }}
                  onChange={(next) => {
                    airlineField.onChange(next.airlineIata);
                    flightField.onChange(next.flightNumber);
                    if (next.carrier !== undefined) {
                      carrierField.onChange(next.carrier);
                    }
                  }}
                />
              )}
            />
          )}
        />
      )}
    />
  );
}

function RhfHarness({
  defaultValues,
}: {
  defaultValues: FormValues;
}) {
  const { control } = useForm<FormValues>({ defaultValues });
  return <AirlinePickerHarness control={control} />;
}

describe("AirlinePicker — react-hook-form Controller integration (#543)", () => {
  it("clearing the flight number input renders empty, not the saved defaultValues entry", () => {
    render(
      <RhfHarness
        defaultValues={{ airlineIata: "UA", flightNumber: "346", carrier: undefined }}
      />
    );

    const flightInput = screen.getByRole("textbox", {
      name: /flight number/i,
    }) as HTMLInputElement;
    expect(flightInput.value).toBe("346");

    // Simulate select-all + delete: the user clears the field to "".
    fireEvent.change(flightInput, { target: { value: "" } });

    // Before the fix, field.onChange(undefined) reverted this to "346".
    expect(flightInput.value).toBe("");
  });

  it("clicking the airline clear (X) button renders an empty combobox, not the saved airline", () => {
    render(
      <RhfHarness
        defaultValues={{ airlineIata: "UA", flightNumber: "346", carrier: undefined }}
      />
    );

    const combobox = screen.getByRole("combobox", {
      name: /airline/i,
    }) as HTMLInputElement;
    expect(combobox.value).toBe("UA / United Airlines");

    const clearButton = screen.getByRole("button", { name: /clear airline/i });
    fireEvent.click(clearButton);

    // Before the fix, field.onChange(undefined) reverted this to
    // "UA / United Airlines".
    expect(combobox.value).toBe("");
  });

  it("supports clear-then-retype: full replacement of a pre-populated flight number", () => {
    render(
      <RhfHarness
        defaultValues={{ airlineIata: "UA", flightNumber: "346", carrier: undefined }}
      />
    );

    const flightInput = screen.getByRole("textbox", {
      name: /flight number/i,
    }) as HTMLInputElement;
    expect(flightInput.value).toBe("346");

    // Clear the field (select-all + delete).
    fireEvent.change(flightInput, { target: { value: "" } });
    expect(flightInput.value).toBe("");

    // Retype "1802" one keystroke at a time — each change event carries the
    // full current field value, as a real browser input does.
    fireEvent.change(flightInput, { target: { value: "1" } });
    fireEvent.change(flightInput, { target: { value: "18" } });
    fireEvent.change(flightInput, { target: { value: "180" } });
    fireEvent.change(flightInput, { target: { value: "1802" } });

    expect(flightInput.value).toBe("1802");
  });
});
