/**
 * Unit tests for AddItemForm — organizer-only bottom sheet form.
 * TDD: written before implementation.
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AddItemForm } from "../add-item-form";

vi.mock("@/lib/actions/itinerary", () => ({
  addItineraryItem: vi.fn(),
  updateItineraryItem: vi.fn(),
  deleteItineraryItem: vi.fn(),
}));

import { addItineraryItem } from "@/lib/actions/itinerary";

const mockAdd = vi.mocked(addItineraryItem);

describe("AddItemForm", () => {
  const defaultProps = {
    tripId: "trip-uuid-1",
    // Fix B: tripTimezone is now required so the new optional start/end
    // time fields render in the correct timezone (mirrors EditItemForm).
    tripTimezone: "America/New_York",
    onSuccess: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    mockAdd.mockResolvedValue({
      ok: true,
      item: {
        id: "item-1",
        trip_id: "trip-uuid-1",
        title: "Dinner",
        kind: "meal",
        day: "2026-08-01",
        start_time: null,
        end_time: null,
        location: null,
        address: null,
        notes: null,
        cost_cents: null,
        currency: "USD",
        created_by: "user-1",
        created_at: "2026-05-20T00:00:00Z",
        updated_at: "2026-05-20T00:00:00Z",
        visibility: "everyone",
        activity_tag: [],
        dress_code: null,
        idempotency_key: null,
      },
    });
  });

  it("renders the title input", () => {
    render(<AddItemForm {...defaultProps} />);
    expect(screen.getByLabelText(/what is it\?/i)).toBeInTheDocument();
  });

  it("renders kind select with all 5 options", () => {
    render(<AddItemForm {...defaultProps} />);
    expect(screen.getByLabelText(/kind/i)).toBeInTheDocument();
    expect(screen.getByText(/event/i)).toBeInTheDocument();
    expect(screen.getByText(/lodging/i)).toBeInTheDocument();
    expect(screen.getByText(/transport/i)).toBeInTheDocument();
    expect(screen.getByText(/meal/i)).toBeInTheDocument();
    expect(screen.getByText(/activity/i)).toBeInTheDocument();
  });

  it("renders starts_at and day inputs", () => {
    render(<AddItemForm {...defaultProps} />);
    // "Starts" labels both the day-only field and the optional start-time
    // field (Fix B) — disambiguate by input type.
    expect(
      screen.getByLabelText(/starts/i, { selector: "input[type='date']" })
    ).toBeInTheDocument();
  });

  it("renders optional start/end time fields (Fix B)", () => {
    render(<AddItemForm {...defaultProps} />);
    expect(
      screen.getByLabelText(/starts/i, {
        selector: "input[type='datetime-local']",
      })
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/ends/i)).toBeInTheDocument();
  });

  it("renders visibility select", () => {
    render(<AddItemForm {...defaultProps} />);
    expect(screen.getByLabelText(/who sees this\?/i)).toBeInTheDocument();
  });

  it("renders Add it and Cancel buttons", () => {
    render(<AddItemForm {...defaultProps} />);
    expect(screen.getByRole("button", { name: /add it/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("calls onCancel when Cancel is clicked", () => {
    const onCancel = vi.fn();
    render(<AddItemForm {...defaultProps} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls addItineraryItem with correct tripId on submit", async () => {
    render(<AddItemForm {...defaultProps} />);

    // Fill required fields
    fireEvent.change(screen.getByLabelText(/what is it\?/i), {
      target: { value: "Pool party" },
    });

    const dayInput = screen.getByLabelText(/starts/i, {
      selector: "input[type='date']",
    });
    fireEvent.change(dayInput, { target: { value: "2026-08-01" } });

    fireEvent.click(screen.getByRole("button", { name: /add it/i }));

    await waitFor(() => {
      expect(mockAdd).toHaveBeenCalledWith(
        expect.objectContaining({ tripId: "trip-uuid-1", title: "Pool party" }),
        expect.any(String)
      );
    });
  });

  it("calls onSuccess after successful save", async () => {
    const onSuccess = vi.fn();
    render(<AddItemForm {...defaultProps} onSuccess={onSuccess} />);

    fireEvent.change(screen.getByLabelText(/what is it\?/i), {
      target: { value: "Boat cruise" },
    });
    fireEvent.change(
      screen.getByLabelText(/starts/i, { selector: "input[type='date']" }),
      {
        target: { value: "2026-08-02" },
      }
    );

    fireEvent.click(screen.getByRole("button", { name: /add it/i }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it("shows error on save failure", async () => {
    mockAdd.mockResolvedValue({
      ok: false,
      errorKey: "itinerary_save_failed",
    });
    render(<AddItemForm {...defaultProps} />);

    fireEvent.change(screen.getByLabelText(/what is it\?/i), {
      target: { value: "Something" },
    });
    fireEvent.change(
      screen.getByLabelText(/starts/i, { selector: "input[type='date']" }),
      {
        target: { value: "2026-08-01" },
      }
    );

    fireEvent.click(screen.getByRole("button", { name: /add it/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });
});
