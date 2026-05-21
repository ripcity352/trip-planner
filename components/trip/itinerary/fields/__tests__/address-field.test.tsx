/**
 * Unit tests for AddressField sub-component.
 *
 * TDD: written before implementation.
 * This is a pre-split refactor — zero behavior change from edit-item-form.tsx.
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AddressField } from "../address-field";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";

describe("AddressField", () => {
  it("renders a label with the address string", () => {
    render(<AddressField value="" onChange={vi.fn()} disabled={false} />);
    expect(screen.getByText(M3_UI_STRINGS.itineraryForm_address_label)).toBeInTheDocument();
  });

  it("renders a text input", () => {
    render(<AddressField value="" onChange={vi.fn()} disabled={false} />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("displays placeholder text", () => {
    render(<AddressField value="" onChange={vi.fn()} disabled={false} />);
    expect(screen.getByPlaceholderText(M3_UI_STRINGS.itineraryForm_address_placeholder)).toBeInTheDocument();
  });

  it("displays the current value", () => {
    render(<AddressField value="123 Main St" onChange={vi.fn()} disabled={false} />);
    expect(screen.getByRole("textbox")).toHaveValue("123 Main St");
  });

  it("calls onChange when user types", () => {
    const onChange = vi.fn();
    render(<AddressField value="" onChange={onChange} disabled={false} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "456 Oak Ave" } });
    expect(onChange).toHaveBeenCalledWith("456 Oak Ave");
  });

  it("disables the input when disabled=true", () => {
    render(<AddressField value="" onChange={vi.fn()} disabled={true} />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });
});
