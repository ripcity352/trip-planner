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
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AirportPicker } from "../airport-picker";

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
