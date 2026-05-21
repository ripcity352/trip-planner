/**
 * Unit tests for AddressField sub-component.
 *
 * W2a update: AddressField now wraps AddressAutocomplete. Tests verify
 * that the wrapper passes props correctly and behavioral contract is
 * preserved (value, onChange, disabled).
 *
 * The onChange signature changes from (value: string) → (address, placeId, provider)
 * matching the W2a spec.
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { AddressField } from "../address-field";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";

// ---------------------------------------------------------------------------
// Mock fetch so autocomplete POST doesn't hang tests
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
  global.fetch = mockFetch;
  mockFetch.mockReset();
  vi.clearAllTimers();
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ suggestions: [] }),
  } as unknown as Response);
});

afterEach(() => {
  vi.runAllTimers();
  vi.useRealTimers();
});

describe("AddressField", () => {
  it("renders a label with the address string", () => {
    render(
      <AddressField address="" onChange={vi.fn()} disabled={false} />
    );
    expect(
      screen.getByText(M3_UI_STRINGS.itineraryForm_address_label)
    ).toBeInTheDocument();
  });

  it("renders a text input", () => {
    render(<AddressField address="" onChange={vi.fn()} disabled={false} />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("displays placeholder text", () => {
    render(<AddressField address="" onChange={vi.fn()} disabled={false} />);
    expect(
      screen.getByPlaceholderText(M3_UI_STRINGS.itineraryForm_address_placeholder)
    ).toBeInTheDocument();
  });

  it("displays the current address value", () => {
    render(
      <AddressField address="123 Main St" onChange={vi.fn()} disabled={false} />
    );
    expect(screen.getByRole("textbox")).toHaveValue("123 Main St");
  });

  it("calls onChange when user types and blurs (freeform fallback)", async () => {
    const onChange = vi.fn();
    render(<AddressField address="" onChange={onChange} disabled={false} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "456 Oak Ave" } });
    fireEvent.blur(input);
    await act(async () => {
      vi.advanceTimersByTime(10);
      await Promise.resolve();
    });
    // Freeform fallback: no suggestion selected → placeId and provider are undefined
    expect(onChange).toHaveBeenCalledWith("456 Oak Ave", undefined, undefined);
  });

  it("disables the input when disabled=true", () => {
    render(<AddressField address="" onChange={vi.fn()} disabled={true} />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });
});
