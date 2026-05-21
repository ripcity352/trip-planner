/**
 * Unit tests for ItemFlagForm — wrapper that delegates to MemberFlagPicker.
 *
 * M4 W1c: ItemFlagForm now renders MemberFlagPicker. These tests verify the
 * delegation contract: the form passes itemId through and the underlying
 * chip picker + freeform input is rendered.
 *
 * Detailed picker behavior is tested in member-flag-picker.test.tsx.
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

  it("renders the chip picker via MemberFlagPicker (heading visible)", () => {
    render(<ItemFlagForm itemId="item-1" />);
    // Heading from M4_UI_STRINGS — confirms MemberFlagPicker is rendered
    expect(screen.getByText("Anything we should know?")).toBeInTheDocument();
  });

  it("renders the freeform input with Anything else? placeholder", () => {
    render(<ItemFlagForm itemId="item-1" />);
    expect(
      screen.getByPlaceholderText(/anything else/i)
    ).toBeInTheDocument();
  });

  it("calls addItemFlag with correct itemId on freeform submit", async () => {
    render(<ItemFlagForm itemId="item-99" />);

    const input = screen.getByPlaceholderText(/anything else/i);
    fireEvent.change(input, { target: { value: "vegan" } });
    fireEvent.click(screen.getByRole("button", { name: /add/i }));

    await waitFor(() => {
      expect(mockAdd).toHaveBeenCalledWith(
        expect.objectContaining({ itemId: "item-99", flag: "vegan" })
      );
    });
  });

  it("shows error message on save failure", async () => {
    mockAdd.mockResolvedValue({ ok: false, errorKey: "item_flag_save_failed" });
    render(<ItemFlagForm itemId="item-1" />);

    const input = screen.getByPlaceholderText(/anything else/i);
    fireEvent.change(input, { target: { value: "late arrival" } });
    fireEvent.click(screen.getByRole("button", { name: /add/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });

  it("does not submit if freeform flag field is empty", async () => {
    render(<ItemFlagForm itemId="item-1" />);

    // Add button is disabled when freeform is empty
    const addBtn = screen.getByRole("button", { name: /add/i });
    expect(addBtn).toBeDisabled();
    expect(mockAdd).not.toHaveBeenCalled();
  });
});
