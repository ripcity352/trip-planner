/**
 * TDD RED phase — airport picker tests.
 *
 * Covers:
 *   1. Renders with a label.
 *   2. Filtering by IATA/city substring (case-insensitive).
 *   3. Click suggestion → onChange called with uppercase IATA code.
 *   4. Freeform fallback — sets sanitized typed text.
 *   5. Injection vectors: NUL / CRLF stripped from freeform text.
 *   6. Combobox/listbox/option roles.
 *   7. Tap targets: min-h-[44px] on suggestion rows.
 *   8. Disabled prop disables the input.
 */

import "@testing-library/jest-dom/vitest";
import * as React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AirportPicker } from "../airport-picker";

// Controlled harness — feeds onChange back into value, mirroring real
// usage via an RHF Controller. Needed to test #642's focused-blur
// resolution, which depends on the `value` prop tracking selections.
function ControlledAirportPicker({
  initialValue,
}: {
  initialValue?: string;
}) {
  const [value, setValue] = React.useState<string | undefined>(initialValue);
  return (
    <AirportPicker
      id="airport-picker-test"
      label="Airport"
      value={value}
      onChange={setValue}
    />
  );
}

function renderPicker(
  value: string | undefined = undefined,
  onChange = vi.fn(),
  disabled = false,
  label = "Airport"
) {
  return render(
    <AirportPicker
      id="airport-picker-test"
      label={label}
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  );
}

function typeIntoInput(input: Element, text: string) {
  fireEvent.change(input, { target: { value: text } });
}

describe("AirportPicker — render", () => {
  it("renders the typeahead input with the given label", () => {
    renderPicker(undefined, vi.fn(), false, "Coming from");
    expect(
      screen.getByRole("combobox", { name: /coming from/i })
    ).toBeInTheDocument();
  });

  it("displays the resolved 'IATA / city' string when value is a known IATA code", () => {
    renderPicker("PDX");
    const input = screen.getByRole("combobox", { name: /airport/i }) as HTMLInputElement;
    expect(input.value).toBe("PDX / Portland");
  });

  it("displays raw free-text value when it doesn't match a known IATA code", () => {
    renderPicker("Some Ranch Strip");
    const input = screen.getByRole("combobox", { name: /airport/i }) as HTMLInputElement;
    expect(input.value).toBe("Some Ranch Strip");
  });
});

describe("AirportPicker — filtering", () => {
  it("shows suggestions when user types a city substring (case-insensitive)", async () => {
    renderPicker();
    const input = screen.getByRole("combobox", { name: /airport/i });
    typeIntoInput(input, "portl");
    await waitFor(() => {
      expect(screen.getByText(/PDX.*Portland/i)).toBeInTheDocument();
    });
  });

  it("shows suggestions when user types an IATA code", async () => {
    renderPicker();
    const input = screen.getByRole("combobox", { name: /airport/i });
    typeIntoInput(input, "SEA");
    await waitFor(() => {
      expect(screen.getByText(/SEA.*Seattle/i)).toBeInTheDocument();
    });
  });
});

describe("AirportPicker — selection", () => {
  it("calls onChange with the uppercase IATA code when a suggestion is clicked", async () => {
    const onChange = vi.fn();
    renderPicker(undefined, onChange);
    const input = screen.getByRole("combobox", { name: /airport/i });
    typeIntoInput(input, "portl");
    await waitFor(() => expect(screen.getByText(/PDX.*Portland/i)).toBeInTheDocument());
    fireEvent.mouseDown(screen.getByText(/PDX.*Portland/i));
    expect(onChange).toHaveBeenCalledWith("PDX");
  });

  it("normalizes to the uppercase IATA code when the typed text is an exact case-insensitive match, even without an explicit click", () => {
    // The display resolves to "PDX / Portland" (looking selected) the
    // instant the raw typed text exactly matches a catalog code — the
    // committed value must match that resolution, not the raw case the
    // user typed, or the stored data silently reintroduces the case
    // inconsistency this picker exists to fix (a real bug caught during
    // a live-site walk: typing "las" saved as lowercase "las").
    const onChange = vi.fn();
    renderPicker(undefined, onChange);
    const input = screen.getByRole("combobox", { name: /airport/i });
    typeIntoInput(input, "pdx");
    expect(onChange).toHaveBeenLastCalledWith("PDX");
  });
});

describe("AirportPicker — freeform fallback", () => {
  it("shows freeform fallback affordance when query matches nothing", async () => {
    renderPicker();
    const input = screen.getByRole("combobox", { name: /airport/i });
    typeIntoInput(input, "ZZZ Unknown Strip");
    await waitFor(() => {
      expect(screen.getByText("Type your own")).toBeInTheDocument();
    });
  });

  it("calls onChange with sanitized typed text on freeform selection", async () => {
    const onChange = vi.fn();
    renderPicker(undefined, onChange);
    const input = screen.getByRole("combobox", { name: /airport/i });
    typeIntoInput(input, "Grandpa's Ranch Strip");
    await waitFor(() => expect(screen.getByText("Type your own")).toBeInTheDocument());
    fireEvent.mouseDown(screen.getByText("Type your own"));
    expect(onChange).toHaveBeenCalledWith("Grandpa's Ranch Strip");
  });
});

describe("AirportPicker — injection vectors", () => {
  it("strips NUL bytes from freeform text on every onChange, including the raw keystroke commit", async () => {
    const onChange = vi.fn();
    renderPicker(undefined, onChange);
    const input = screen.getByRole("combobox", { name: /airport/i });
    fireEvent.change(input, { target: { value: "Strip\0Null" } });
    await waitFor(() => expect(screen.getByText("Type your own")).toBeInTheDocument());
    fireEvent.mouseDown(screen.getByText("Type your own"));
    // The common "type then Save" path never opens the freeform row — every
    // onChange call (not just the last) must be free of the injected byte.
    expect(onChange.mock.calls.length).toBeGreaterThan(0);
    for (const [value] of onChange.mock.calls) {
      expect(value as string).not.toContain("\0");
    }
  });

  it("strips CRLF sequences from freeform text on every onChange, including the raw keystroke commit", async () => {
    const onChange = vi.fn();
    renderPicker(undefined, onChange);
    const input = screen.getByRole("combobox", { name: /airport/i });
    fireEvent.change(input, { target: { value: "Strip\r\nInject" } });
    await waitFor(() => expect(screen.getByText("Type your own")).toBeInTheDocument());
    fireEvent.mouseDown(screen.getByText("Type your own"));
    expect(onChange.mock.calls.length).toBeGreaterThan(0);
    for (const [value] of onChange.mock.calls) {
      expect(value as string).not.toMatch(/[\r\n]/);
    }
  });
});

describe("AirportPicker — accessibility & roles", () => {
  it("input has role combobox, listbox has role listbox, options have role option", async () => {
    renderPicker();
    const input = screen.getByRole("combobox", { name: /airport/i });
    expect(input).toHaveAttribute("aria-expanded");
    typeIntoInput(input, "portl");
    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeInTheDocument();
      expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
    });
  });

  it("suggestion rows have the min-h-[44px] tap target class", async () => {
    renderPicker();
    const input = screen.getByRole("combobox", { name: /airport/i });
    typeIntoInput(input, "portl");
    await waitFor(() => {
      const option = screen.getAllByRole("option")[0];
      expect(option.className).toContain("min-h-[44px]");
    });
  });
});

describe("AirportPicker — disabled", () => {
  it("disables the input when disabled prop is true", () => {
    renderPicker(undefined, vi.fn(), true);
    expect(screen.getByRole("combobox", { name: /airport/i })).toBeDisabled();
  });
});

// ─── #642: no displayValue rewrite while focused ───────────────────────────

describe("AirportPicker — no display rewrite while focused (#642)", () => {
  it("keeps the visible text exactly as typed while focused, even once an exact IATA match resolves underneath", () => {
    render(<ControlledAirportPicker />);
    const input = screen.getByRole("combobox", {
      name: /airport/i,
    }) as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "S" } });
    fireEvent.change(input, { target: { value: "Se" } });
    // "SEA" is an exact catalog match — pre-fix, this immediately swapped
    // the visible text to "SEA / Seattle" out from under the typist.
    fireEvent.change(input, { target: { value: "SEA" } });
    expect(input.value).toBe("SEA");
    fireEvent.change(input, { target: { value: "SEAt" } });
    expect(input.value).toBe("SEAt");
    fireEvent.change(input, { target: { value: "SEAtt" } });
    expect(input.value).toBe("SEAtt");
  });

  it("resolves the visible text to the canonical 'IATA / City' string on blur when an exact match exists", () => {
    render(<ControlledAirportPicker />);
    const input = screen.getByRole("combobox", {
      name: /airport/i,
    }) as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "SEA" } });
    fireEvent.blur(input);
    expect(input.value).toBe("SEA / Seattle");
  });
});

// ─── #642 secondary: filter ignores the generic "Airport" token ───────────

describe("AirportPicker — filter ignores the generic 'Airport' token (#642)", () => {
  it("does not match every catalog entry on the generic substring 'air' — only the freeform fallback shows", async () => {
    renderPicker();
    const input = screen.getByRole("combobox", { name: /airport/i });
    typeIntoInput(input, "air");
    await waitFor(() => {
      const options = screen.getAllByRole("option");
      expect(options).toHaveLength(1);
      expect(options[0]).toHaveTextContent("Type your own");
    });
  });

  it("still matches Portland via the city field on the substring 'port'", async () => {
    renderPicker();
    const input = screen.getByRole("combobox", { name: /airport/i });
    typeIntoInput(input, "port");
    await waitFor(() => {
      expect(screen.getByText(/PDX.*Portland/i)).toBeInTheDocument();
    });
  });
});

// ─── regression: query containing "airport" must still match (#642 follow-up) ──

describe("AirportPicker — query containing the word 'airport' still matches (regression)", () => {
  it("matches LHR when the query is 'Heathrow Airport'", async () => {
    renderPicker();
    const input = screen.getByRole("combobox", { name: /airport/i });
    typeIntoInput(input, "Heathrow Airport");
    await waitFor(() => {
      expect(screen.getByText(/LHR.*London/i)).toBeInTheDocument();
    });
  });

  it("matches AMS when the query is 'amsterdam airport' (lowercase)", async () => {
    renderPicker();
    const input = screen.getByRole("combobox", { name: /airport/i });
    typeIntoInput(input, "amsterdam airport");
    await waitFor(() => {
      expect(screen.getByText(/AMS.*Amsterdam/i)).toBeInTheDocument();
    });
  });

  it("matches AMS when the query is 'Amsterdam Schiphol' (name has 'Airport' in the middle, not the query)", async () => {
    renderPicker();
    const input = screen.getByRole("combobox", { name: /airport/i });
    typeIntoInput(input, "Amsterdam Schiphol");
    await waitFor(() => {
      expect(screen.getByText(/AMS.*Amsterdam/i)).toBeInTheDocument();
    });
  });
});
