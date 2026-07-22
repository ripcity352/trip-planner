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
        end_day: null,
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

  // #394: cost round-trip — the cents conversion happens on submit, not
  // in the zod schema, so these assert against what actually reaches the
  // server action.
  describe("cost", () => {
    const fillRequired = () => {
      fireEvent.change(screen.getByLabelText(/what is it\?/i), {
        target: { value: "Golf outing" },
      });
      fireEvent.change(
        screen.getByLabelText(/starts/i, { selector: "input[type='date']" }),
        { target: { value: "2026-08-01" } }
      );
    };

    it("renders the cost input with no asterisk in its label", () => {
      render(<AddItemForm {...defaultProps} />);
      const label = screen.getByText(/cost/i);
      expect(label.textContent).not.toMatch(/\*/);
    });

    it("converts a whole-dollar string to cents on submit", async () => {
      render(<AddItemForm {...defaultProps} />);
      fillRequired();
      fireEvent.change(screen.getByLabelText(/cost/i), {
        target: { value: "45" },
      });
      fireEvent.click(screen.getByRole("button", { name: /add it/i }));

      await waitFor(() => {
        expect(mockAdd).toHaveBeenCalledWith(
          expect.objectContaining({ costCents: 4500 }),
          expect.any(String)
        );
      });
    });

    it("converts a cents-bearing string to cents on submit", async () => {
      render(<AddItemForm {...defaultProps} />);
      fillRequired();
      fireEvent.change(screen.getByLabelText(/cost/i), {
        target: { value: "89.99" },
      });
      fireEvent.click(screen.getByRole("button", { name: /add it/i }));

      await waitFor(() => {
        expect(mockAdd).toHaveBeenCalledWith(
          expect.objectContaining({ costCents: 8999 }),
          expect.any(String)
        );
      });
    });

    it("sends costCents: null when the field is left empty", async () => {
      render(<AddItemForm {...defaultProps} />);
      fillRequired();
      fireEvent.click(screen.getByRole("button", { name: /add it/i }));

      await waitFor(() => {
        expect(mockAdd).toHaveBeenCalledWith(
          expect.objectContaining({ costCents: null }),
          expect.any(String)
        );
      });
    });

    it("rejects a cost with more than 2 decimal places", async () => {
      // #431/restoreAllMocks doesn't clear prior calls on this file's
      // vi.fn() mocks — assert against the call count at this point,
      // not an absolute "never called."
      const callsBefore = mockAdd.mock.calls.length;
      render(<AddItemForm {...defaultProps} />);
      fillRequired();
      fireEvent.change(screen.getByLabelText(/cost/i), {
        target: { value: "12.345" },
      });
      fireEvent.click(screen.getByRole("button", { name: /add it/i }));

      await waitFor(() => {
        expect(
          screen.getByText(/enter a dollar amount/i)
        ).toBeInTheDocument();
      });
      expect(mockAdd.mock.calls.length).toBe(callsBefore);
    });
  });
});
