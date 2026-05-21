/**
 * Unit tests for DressCodeField sub-component.
 *
 * TDD: written before implementation.
 * This is a pre-split refactor — zero behavior change from edit-item-form.tsx.
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DressCodeField } from "../dress-code-field";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";

describe("DressCodeField", () => {
  it("renders a label with the dress code string", () => {
    render(<DressCodeField value="" onChange={vi.fn()} disabled={false} />);
    expect(screen.getByText(M3_UI_STRINGS.itineraryForm_dress_label)).toBeInTheDocument();
  });

  it("renders a text input", () => {
    render(<DressCodeField value="" onChange={vi.fn()} disabled={false} />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("displays the current value", () => {
    render(<DressCodeField value="Black tie" onChange={vi.fn()} disabled={false} />);
    expect(screen.getByRole("textbox")).toHaveValue("Black tie");
  });

  it("calls onChange when user types", () => {
    const onChange = vi.fn();
    render(<DressCodeField value="" onChange={onChange} disabled={false} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Casual" } });
    expect(onChange).toHaveBeenCalledWith("Casual");
  });

  it("disables the input when disabled=true", () => {
    render(<DressCodeField value="" onChange={vi.fn()} disabled={true} />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });
});
