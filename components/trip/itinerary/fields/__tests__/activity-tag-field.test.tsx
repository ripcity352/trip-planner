/**
 * Unit tests for ActivityTagField sub-component.
 *
 * TDD: written before implementation.
 * This is a pre-split refactor — zero behavior change from edit-item-form.tsx.
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ActivityTagField } from "../activity-tag-field";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";

describe("ActivityTagField", () => {
  it("renders a label with the tags string", () => {
    render(<ActivityTagField value="" onChange={vi.fn()} disabled={false} />);
    expect(screen.getByText(M3_UI_STRINGS.itineraryForm_tags_label)).toBeInTheDocument();
  });

  it("renders a text input", () => {
    render(<ActivityTagField value="" onChange={vi.fn()} disabled={false} />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("displays the current value", () => {
    render(<ActivityTagField value="beach, nightlife" onChange={vi.fn()} disabled={false} />);
    expect(screen.getByRole("textbox")).toHaveValue("beach, nightlife");
  });

  it("calls onChange when user types", () => {
    const onChange = vi.fn();
    render(<ActivityTagField value="" onChange={onChange} disabled={false} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "adventure" } });
    expect(onChange).toHaveBeenCalledWith("adventure");
  });

  it("disables the input when disabled=true", () => {
    render(<ActivityTagField value="" onChange={vi.fn()} disabled={true} />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });
});
