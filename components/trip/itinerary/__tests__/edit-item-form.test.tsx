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
  // Fix B: start_time/end_time as returned from the DB are bare
  // `HH:mm:ss` (Postgres `time without time zone`) — NOT full ISO
  // instants. The form must hydrate these via dbTimeToIso before
  // handing them to the datetime-local widget.
  start_time: "19:00:00",
  end_time: "21:00:00",
  end_day: null,
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

  // Fix B round-trip proof: a DB `HH:mm:ss` value hydrates into the
  // datetime-local widget as the correct trip-local wall clock, and an
  // unchanged save resubmits the exact same UTC instant the DB time
  // represents — the edit form no longer blocks itself on its own default
  // value (the zod `.datetime()` validation that used to reject a bare
  // `19:00:00`).
  it("round-trip: hydrates start/end time from DB HH:mm:ss and resubmits the same instant unchanged", async () => {
    render(<EditItemForm {...defaultProps} />);

    // item.day = 2026-08-01, start_time = 19:00:00, tripTimezone =
    // America/New_York (EDT, UTC-4) → local input value 2026-08-01T19:00.
    const startInput = document.getElementById(
      "edit-datetime"
    ) as HTMLInputElement;
    const endInput = document.getElementById(
      "edit-endtime"
    ) as HTMLInputElement;
    expect(startInput.value).toBe("2026-08-01T19:00");
    expect(endInput.value).toBe("2026-08-01T21:00");

    // Save without touching the time fields — the form must not have been
    // blocked by its own default value (the original P0: default value
    // failed the zod `.datetime()` schema, disabling every edit).
    fireEvent.click(screen.getByRole("button", { name: /save it/i }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: "item-abc",
          // 2026-08-01 19:00 EDT (UTC-4) = 2026-08-01T23:00:00.000Z
          startTime: "2026-08-01T23:00:00.000Z",
          // 2026-08-01 21:00 EDT (UTC-4) = 2026-08-02T01:00:00.000Z
          endTime: "2026-08-02T01:00:00.000Z",
        }),
        expect.any(String)
      );
    });
  });

  // #504: a multi-day item's end time must rehydrate against its end_day,
  // not the start day — the old `dbTimeToIso(item.day, item.end_time, …)`
  // silently pulled the end instant back to the start day on every edit.
  it("hydrates the end time against end_day for a multi-day item", () => {
    render(
      <EditItemForm
        {...defaultProps}
        item={{
          ...baseItem,
          day: "2026-08-01",
          end_day: "2026-08-03",
          end_time: "01:00:00",
        }}
      />
    );
    const endInput = document.getElementById("edit-endtime") as HTMLInputElement;
    expect(endInput.value).toBe("2026-08-03T01:00");
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

  // #394: cost field. The clear-to-null case is LOAD-BEARING —
  // updateItineraryItem only writes cost_cents when `costCents !==
  // undefined`, so the form must always pass a concrete value.
  describe("cost", () => {
    it("pre-fills the cost from cost_cents as a decimal string", () => {
      render(
        <EditItemForm {...defaultProps} item={{ ...baseItem, cost_cents: 4500 }} />
      );
      const costInput = screen.getByLabelText(/cost/i) as HTMLInputElement;
      expect(costInput.value).toBe("45.00");
    });

    it("pre-fills an empty cost input when cost_cents is null", () => {
      render(
        <EditItemForm {...defaultProps} item={{ ...baseItem, cost_cents: null }} />
      );
      const costInput = screen.getByLabelText(/cost/i) as HTMLInputElement;
      expect(costInput.value).toBe("");
    });

    it("sends the updated cents value when the cost is changed", async () => {
      render(
        <EditItemForm {...defaultProps} item={{ ...baseItem, cost_cents: 4500 }} />
      );
      fireEvent.change(screen.getByLabelText(/cost/i), {
        target: { value: "89.99" },
      });
      fireEvent.click(screen.getByRole("button", { name: /save it/i }));

      await waitFor(() => {
        expect(mockUpdate).toHaveBeenCalledWith(
          expect.objectContaining({ itemId: "item-abc", costCents: 8999 }),
          expect.any(String)
        );
      });
    });

    // LOAD-BEARING: clearing the cost field must send costCents: null,
    // not omit the field — omission would leave the old price in place
    // under updateItineraryItem's `fields.costCents !== undefined` guard.
    it("clears the cost to null when the field is emptied", async () => {
      render(
        <EditItemForm {...defaultProps} item={{ ...baseItem, cost_cents: 4500 }} />
      );
      fireEvent.change(screen.getByLabelText(/cost/i), {
        target: { value: "" },
      });
      fireEvent.click(screen.getByRole("button", { name: /save it/i }));

      await waitFor(() => {
        expect(mockUpdate).toHaveBeenCalledWith(
          expect.objectContaining({ itemId: "item-abc", costCents: null }),
          expect.any(String)
        );
      });
    });

    it("always includes costCents even when nothing else changed", async () => {
      render(
        <EditItemForm {...defaultProps} item={{ ...baseItem, cost_cents: 4500 }} />
      );
      fireEvent.click(screen.getByRole("button", { name: /save it/i }));

      await waitFor(() => {
        expect(mockUpdate).toHaveBeenCalledWith(
          expect.objectContaining({ itemId: "item-abc", costCents: 4500 }),
          expect.any(String)
        );
      });
    });
  });

  // #484: end-before-start — direct instant comparison, not string compare,
  // since startTime/endTime carry a UTC offset.
  describe("end-before-start validation (#484)", () => {
    const setTimes = (startLocal: string, endLocal: string) => {
      const startInput = document.getElementById("edit-datetime") as HTMLInputElement;
      const endInput = document.getElementById("edit-endtime") as HTMLInputElement;
      fireEvent.change(startInput, { target: { value: startLocal } });
      fireEvent.change(endInput, { target: { value: endLocal } });
    };

    it("rejects end < start", async () => {
      const callsBefore = mockUpdate.mock.calls.length;
      render(<EditItemForm {...defaultProps} />);
      setTimes("2026-08-01T20:00", "2026-08-01T19:00");
      fireEvent.click(screen.getByRole("button", { name: /save it/i }));

      await waitFor(() => {
        expect(screen.getByText(/ends before it starts/i)).toBeInTheDocument();
      });
      expect(mockUpdate.mock.calls.length).toBe(callsBefore);
    });

    it("rejects end == start", async () => {
      const callsBefore = mockUpdate.mock.calls.length;
      render(<EditItemForm {...defaultProps} />);
      setTimes("2026-08-01T19:00", "2026-08-01T19:00");
      fireEvent.click(screen.getByRole("button", { name: /save it/i }));

      await waitFor(() => {
        expect(screen.getByText(/ends before it starts/i)).toBeInTheDocument();
      });
      expect(mockUpdate.mock.calls.length).toBe(callsBefore);
    });

    it("passes when end > start", async () => {
      render(<EditItemForm {...defaultProps} />);
      setTimes("2026-08-01T19:00", "2026-08-01T20:00");
      fireEvent.click(screen.getByRole("button", { name: /save it/i }));

      await waitFor(() => {
        expect(mockUpdate).toHaveBeenCalledWith(
          expect.objectContaining({ itemId: "item-abc" }),
          expect.any(String)
        );
      });
      expect(screen.queryByText(/ends before it starts/i)).not.toBeInTheDocument();
    });

    it("passes with only start time set", async () => {
      render(
        <EditItemForm
          {...defaultProps}
          item={{ ...baseItem, end_time: null, end_day: null }}
        />
      );
      const endInput = document.getElementById("edit-endtime") as HTMLInputElement;
      fireEvent.change(endInput, { target: { value: "" } });
      fireEvent.click(screen.getByRole("button", { name: /save it/i }));

      await waitFor(() => {
        expect(mockUpdate).toHaveBeenCalledWith(
          expect.objectContaining({ itemId: "item-abc" }),
          expect.any(String)
        );
      });
      expect(screen.queryByText(/ends before it starts/i)).not.toBeInTheDocument();
    });

    it("passes with only end time set", async () => {
      render(
        <EditItemForm
          {...defaultProps}
          item={{ ...baseItem, start_time: null }}
        />
      );
      fireEvent.click(screen.getByRole("button", { name: /save it/i }));

      await waitFor(() => {
        expect(mockUpdate).toHaveBeenCalledWith(
          expect.objectContaining({ itemId: "item-abc" }),
          expect.any(String)
        );
      });
      expect(screen.queryByText(/ends before it starts/i)).not.toBeInTheDocument();
    });
  });

  // #484: EditItemForm intentionally has NO day-range check — `day` isn't
  // an editable field here (fixed via defaultValues from item.day), so
  // enforcing the range on this schema would trap an item: if an organizer
  // narrows the trip's dates after the item exists outside the new range,
  // every future save (title, cost, anything) would get blocked by an
  // error pointing at a field the user can't see or fix. This pins the
  // anti-trap behavior — the add form and the server action are the real
  // enforcement points for the range check.
  describe("trip-range validation (#484) — intentionally absent here", () => {
    it("still saves an item whose day falls outside the trip's (narrowed) date range", async () => {
      render(
        <EditItemForm
          {...defaultProps}
          item={{ ...baseItem, day: "2026-07-31" }}
        />
      );
      fireEvent.change(screen.getByLabelText(/what is it\?/i), {
        target: { value: "Updated title" },
      });
      fireEvent.click(screen.getByRole("button", { name: /save it/i }));

      await waitFor(() => {
        expect(mockUpdate).toHaveBeenCalledWith(
          expect.objectContaining({ itemId: "item-abc", title: "Updated title" }),
          expect.any(String)
        );
      });
      expect(screen.queryByText(/outside the trip dates/i)).not.toBeInTheDocument();
    });
  });
});
