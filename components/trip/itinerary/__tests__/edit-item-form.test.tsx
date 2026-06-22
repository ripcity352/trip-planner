/**
 * Unit tests for EditItemForm — same shape as AddItemForm with delete.
 * TDD: written before implementation.
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EditItemForm } from "../edit-item-form";
import type { ItineraryItem } from "@/lib/db/types";

vi.mock("@/lib/actions/itinerary", () => ({
  updateItineraryItem: vi.fn(),
  deleteItineraryItem: vi.fn(),
  addItineraryItem: vi.fn(),
}));

import { updateItineraryItem, deleteItineraryItem } from "@/lib/actions/itinerary";

const mockUpdate = vi.mocked(updateItineraryItem);
const mockDelete = vi.mocked(deleteItineraryItem);

const baseItem: ItineraryItem = {
  id: "item-abc",
  trip_id: "trip-1",
  title: "Dinner at the Wynn",
  kind: "meal",
  day: "2026-08-01",
  // W2b: startTime/endTime are now UTC ISO-8601 strings (datetime-local widget).
  start_time: "2026-08-01T19:00:00.000Z",
  end_time: "2026-08-01T21:00:00.000Z",
  location: null,
  address: "3131 Las Vegas Blvd S, Las Vegas, NV 89109",
  notes: null,
  cost_cents: null,
  currency: "USD",
  created_by: "user-1",
  created_at: "2026-05-20T00:00:00Z",
  updated_at: "2026-05-20T00:00:00Z",
  visibility: "everyone",
  activity_tag: ["fancy"],
  dress_code: "Smart casual",
  idempotency_key: null,
};

describe("EditItemForm", () => {
  const defaultProps = {
    item: baseItem,
    // W2b: tripTimezone is now required so the datetime-local widget renders
    // in the correct timezone. Use America/New_York as a representative value.
    tripTimezone: "America/New_York",
    onSuccess: vi.fn(),
    onCancel: vi.fn(),
    onDeleted: vi.fn(),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    mockUpdate.mockResolvedValue({ ok: true, item: baseItem });
    mockDelete.mockResolvedValue({ ok: true });
  });

  it("pre-fills the title from the item", () => {
    render(<EditItemForm {...defaultProps} />);
    const titleInput = screen.getByLabelText(/what is it\?/i) as HTMLInputElement;
    expect(titleInput.value).toBe("Dinner at the Wynn");
  });

  it("pre-fills the dress code from the item", () => {
    render(<EditItemForm {...defaultProps} />);
    // Target the textbox specifically — W1a's chip group also exposes
    // "Dress code" as an aria-label, so getByLabelText is ambiguous.
    const dressInput = screen.getByRole("textbox", {
      name: /dress code/i,
    }) as HTMLInputElement;
    expect(dressInput.value).toBe("Smart casual");
  });

  it("renders Save it, Cancel, and Delete buttons", () => {
    render(<EditItemForm {...defaultProps} />);
    expect(screen.getByRole("button", { name: /save it/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
  });

  it("calls updateItineraryItem on save", async () => {
    render(<EditItemForm {...defaultProps} />);

    // Update title
    fireEvent.change(screen.getByLabelText(/what is it\?/i), {
      target: { value: "Updated Dinner" },
    });

    fireEvent.click(screen.getByRole("button", { name: /save it/i }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ itemId: "item-abc" }),
        expect.any(String)
      );
    });
  });

  it("shows delete confirmation before deleting", async () => {
    render(<EditItemForm {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: /delete/i }));

    // Should show confirmation text
    await waitFor(() => {
      expect(
        screen.getByText(/delete this item\? can't undo\./i)
      ).toBeInTheDocument();
    });
  });

  it("calls deleteItineraryItem after confirming delete", async () => {
    render(<EditItemForm {...defaultProps} />);

    // First click shows confirm state
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    // Second click executes
    await waitFor(() => {
      expect(
        screen.getByText(/delete this item\? can't undo\./i)
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith("item-abc");
    });
  });

  it("calls onDeleted after successful delete", async () => {
    const onDeleted = vi.fn();
    render(<EditItemForm {...defaultProps} onDeleted={onDeleted} />);

    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    await waitFor(() => {
      expect(
        screen.getByText(/delete this item\? can't undo\./i)
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));

    await waitFor(() => {
      expect(onDeleted).toHaveBeenCalled();
    });
  });

  // #301 regression guard: the #210 delete-confirm button must NOT escalate to
  // a solid `bg-destructive` fill with `text-destructive-foreground` —
  // `--destructive-foreground` is deliberately unbound (globals.css), so that
  // pairing renders undefined text color over a persimmon flood the #210
  // contract bans. Confirm state escalates the persimmon *outline* instead.
  it("delete-confirm button escalates the outline, never a solid persimmon fill", async () => {
    render(<EditItemForm {...defaultProps} />);

    const deleteButton = screen.getByRole("button", { name: /delete/i });
    expect(deleteButton.className).not.toMatch(/text-destructive-foreground/);

    fireEvent.click(deleteButton);
    await waitFor(() => {
      expect(
        screen.getByText(/delete this item\? can't undo\./i)
      ).toBeInTheDocument();
    });

    // In confirm state: still no unbound-foreground / solid-fill pairing.
    expect(deleteButton.className).not.toMatch(/text-destructive-foreground/);
    expect(deleteButton.className).not.toMatch(/(?:^| )bg-destructive(?:$| )/);
    // The escalation it DOES use: full-strength persimmon border + text.
    expect(deleteButton.className).toMatch(/border-destructive(?:$| )/);
    expect(deleteButton.className).toMatch(/text-destructive(?:$| )/);
  });
});
