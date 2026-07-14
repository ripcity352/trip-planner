/**
 * Unit tests for ItemFlagForm — wrapper that delegates to MemberFlagPicker.
 *
 * M4 W1c: ItemFlagForm now renders MemberFlagPicker. These tests verify the
 * delegation contract: the form passes itemId through and the underlying
 * chip picker + freeform input is rendered.
 *
 * #399: the picker's panel now sits behind a disclosure (default closed
 * without saved flags), so interaction tests open it first via the heading
 * trigger.
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

/** Open the #399 disclosure (the voice-locked heading is the trigger). */
function openPanel() {
  fireEvent.click(
    screen.getByRole("button", { name: "Anything we should know?" })
  );
}

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

  it("defaults the panel closed with no saved flags (#399)", () => {
    render(<ItemFlagForm itemId="item-1" />);
    expect(
      screen.getByRole("button", { name: "Anything we should know?" })
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByPlaceholderText(/anything else/i)
    ).not.toBeInTheDocument();
  });

  it("renders the freeform input with Anything else? placeholder once open", () => {
    render(<ItemFlagForm itemId="item-1" />);
    openPanel();
    expect(
      screen.getByPlaceholderText(/anything else/i)
    ).toBeInTheDocument();
  });

  it("calls addItemFlag with correct itemId on freeform submit", async () => {
    render(<ItemFlagForm itemId="item-99" />);
    openPanel();

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
    openPanel();

    const input = screen.getByPlaceholderText(/anything else/i);
    fireEvent.change(input, { target: { value: "late arrival" } });
    fireEvent.click(screen.getByRole("button", { name: /add/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });

  it("does not submit if freeform flag field is empty", async () => {
    render(<ItemFlagForm itemId="item-1" />);
    openPanel();

    // Add button is disabled when freeform is empty
    const addBtn = screen.getByRole("button", { name: /add/i });
    expect(addBtn).toBeDisabled();
    expect(mockAdd).not.toHaveBeenCalled();
  });
});

// #365: rehydration pass-through — previously the prop chain ended here
// and members' saved flags never re-selected. #398: full rows pass through
// (auto-opening the #399 disclosure) so custom flags render back too.
describe("ItemFlagForm — initialFlags pass-through (#365 / #398)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdd.mockResolvedValue({ ok: true });
    mockRemove.mockResolvedValue({ ok: true });
  });

  it("pre-selects chips for flags the member already saved (panel auto-open)", () => {
    render(
      <ItemFlagForm itemId="item-1" initialFlags={[{ flag: "Sober", note: null }]} />
    );
    expect(
      screen.getByRole("button", { name: "Sober", pressed: true })
    ).toBeInTheDocument();
  });

  it("renders the member's stored custom flag with its note (#398)", () => {
    render(
      <ItemFlagForm
        itemId="item-1"
        initialFlags={[{ flag: "low-FODMAP diet", note: "menu heads-up" }]}
      />
    );
    expect(screen.getByText("low-FODMAP diet")).toBeInTheDocument();
    expect(screen.getByText("menu heads-up")).toBeInTheDocument();
  });

  it("wires the custom-flag remove control to removeItemFlag (#398)", async () => {
    render(
      <ItemFlagForm
        itemId="item-1"
        initialFlags={[{ flag: "low-FODMAP diet", note: null }]}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: 'Remove "low-FODMAP diet"' })
    );

    await waitFor(() => {
      expect(mockRemove).toHaveBeenCalledWith("item-1", "low-FODMAP diet");
    });
    await waitFor(() => {
      expect(screen.queryByText("low-FODMAP diet")).not.toBeInTheDocument();
    });
  });
});
