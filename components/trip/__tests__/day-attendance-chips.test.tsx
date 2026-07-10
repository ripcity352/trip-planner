/**
 * Unit tests for DayAttendanceChips (#388) — the /me "Which days are you
 * around?" chip row. Same optimistic pattern as ItemRsvpChip.
 *
 * Rule-8 framing under test: a chip is pressed ONLY when the stored
 * status is 'going'. Unseeded (null) and 'maybe'/'declined' rows all
 * render un-pressed — the member opts INTO days, and a tap on an
 * un-pressed chip writes 'going' (opt-in), a tap on a pressed chip
 * writes 'declined' (opt back out).
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DayAttendanceChips } from "../day-attendance-chips";

vi.mock("@/lib/actions/trip-member-days", () => ({
  setMemberDayAction: vi.fn(),
}));

import { setMemberDayAction } from "@/lib/actions/trip-member-days";

const mockSetMemberDay = vi.mocked(setMemberDayAction);

const TRIP_ID = "11111111-1111-4111-8111-111111111111";

// 2026-08-13 is a Thursday; 2026-08-14 a Friday.
const DAYS = [
  { date: "2026-08-13", status: "going" as const },
  { date: "2026-08-14", status: null },
];

describe("DayAttendanceChips", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockSetMemberDay.mockResolvedValue({ ok: true, status: "going" });
  });

  it("renders one chip per trip day in the lowercase day-header register", () => {
    render(<DayAttendanceChips tripId={TRIP_ID} days={DAYS} />);
    // Date/time register (#211): day-header tier is lowercase `eee d`.
    expect(screen.getByText("thu 13")).toBeInTheDocument();
    expect(screen.getByText("fri 14")).toBeInTheDocument();
  });

  it("presses only the 'going' chip — null (unseeded) renders un-pressed", () => {
    render(<DayAttendanceChips tripId={TRIP_ID} days={DAYS} />);
    const going = screen.getByText("thu 13").closest("button");
    const unseeded = screen.getByText("fri 14").closest("button");
    expect(going).toHaveAttribute("aria-pressed", "true");
    expect(unseeded).toHaveAttribute("aria-pressed", "false");
  });

  it("renders 'declined' and 'maybe' as un-pressed (not-in states)", () => {
    render(
      <DayAttendanceChips
        tripId={TRIP_ID}
        days={[
          { date: "2026-08-13", status: "declined" },
          { date: "2026-08-14", status: "maybe" },
        ]}
      />
    );
    expect(screen.getByText("thu 13").closest("button")).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    expect(screen.getByText("fri 14").closest("button")).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("tapping an un-pressed chip opts IN — calls the action with status 'going'", async () => {
    render(<DayAttendanceChips tripId={TRIP_ID} days={DAYS} />);
    fireEvent.click(screen.getByText("fri 14"));
    await waitFor(() => {
      expect(mockSetMemberDay).toHaveBeenCalledWith(
        { tripId: TRIP_ID, date: "2026-08-14", status: "going" },
        expect.any(String)
      );
    });
  });

  it("tapping a pressed chip opts OUT — calls the action with status 'declined'", async () => {
    mockSetMemberDay.mockResolvedValue({ ok: true, status: "declined" });
    render(<DayAttendanceChips tripId={TRIP_ID} days={DAYS} />);
    fireEvent.click(screen.getByText("thu 13"));
    await waitFor(() => {
      expect(mockSetMemberDay).toHaveBeenCalledWith(
        { tripId: TRIP_ID, date: "2026-08-13", status: "declined" },
        expect.any(String)
      );
    });
  });

  it("updates optimistically before the server responds", async () => {
    mockSetMemberDay.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ ok: true, status: "going" }), 100)
        )
    );
    render(<DayAttendanceChips tripId={TRIP_ID} days={DAYS} />);
    const chip = screen.getByText("fri 14").closest("button")!;
    fireEvent.click(chip);
    await waitFor(() => {
      expect(chip).toHaveAttribute("aria-pressed", "true");
    });
  });

  it("rolls back and shows an inline alert when the action fails", async () => {
    mockSetMemberDay.mockResolvedValue({
      ok: false,
      errorKey: "member_day_save_failed",
    });
    render(<DayAttendanceChips tripId={TRIP_ID} days={DAYS} />);
    const chip = screen.getByText("fri 14").closest("button")!;
    fireEvent.click(chip);
    await waitFor(() => {
      expect(chip).toHaveAttribute("aria-pressed", "false");
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });
});
