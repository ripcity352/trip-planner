/**
 * Unit tests for ItemFlagForm — client component for per-item dietary/
 * participation flag entry.
 * TDD: written before implementation.
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ItemFlagForm } from "../item-flag-form";

vi.mock("@/lib/actions/item-flags", () => ({
  addItemFlag: vi.fn(),
  removeItemFlag: vi.fn(),
}));

import { addItemFlag, removeItemFlag } from "@/lib/actions/item-flags";

const mockAdd = vi.mocked(addItemFlag);
const mockRemove = vi.mocked(removeItemFlag);

describe("ItemFlagForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdd.mockResolvedValue({ ok: true });
    mockRemove.mockResolvedValue({ ok: true });
  });

  it("renders the flag text input and save button", () => {
    render(<ItemFlagForm itemId="item-1" />);
    expect(
      screen.getByPlaceholderText(/allergic|vegetarian|leaving early/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /save the heads-up/i })
    ).toBeInTheDocument();
  });

  it("renders the label from M3_UI_STRINGS", () => {
    render(<ItemFlagForm itemId="item-1" />);
    expect(screen.getByText(/heads up to the organizers/i)).toBeInTheDocument();
  });

  it("calls addItemFlag with form data on submit", async () => {
    render(<ItemFlagForm itemId="item-1" />);

    const input = screen.getByPlaceholderText(
      /allergic|vegetarian|leaving early/i
    );
    fireEvent.change(input, { target: { value: "vegan" } });
    fireEvent.click(screen.getByRole("button", { name: /save the heads-up/i }));

    await waitFor(() => {
      expect(mockAdd).toHaveBeenCalledWith(
        expect.objectContaining({ itemId: "item-1", flag: "vegan" })
      );
    });
  });

  it("shows error message on save failure", async () => {
    mockAdd.mockResolvedValue({ ok: false, errorKey: "item_flag_save_failed" });
    render(<ItemFlagForm itemId="item-1" />);

    const input = screen.getByPlaceholderText(
      /allergic|vegetarian|leaving early/i
    );
    fireEvent.change(input, { target: { value: "late arrival" } });
    fireEvent.click(screen.getByRole("button", { name: /save the heads-up/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });

  it("does not submit if flag field is empty", async () => {
    render(<ItemFlagForm itemId="item-1" />);

    fireEvent.click(screen.getByRole("button", { name: /save the heads-up/i }));

    // addItemFlag should not have been called
    expect(mockAdd).not.toHaveBeenCalled();
  });
});
