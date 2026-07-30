/**
 * Unit tests for LegDaySuggestPrompt (#525) — apply writes one
 * setMemberDayAction per suggested day (fresh idempotency key each),
 * dismiss writes nothing, partial failure keeps the prompt with a calm
 * error line.
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { LegDaySuggestPrompt } from "../leg-day-suggest-prompt";
import type { LegDaySuggestions } from "@/lib/utils/leg-day-suggestions";

vi.mock("@/lib/actions/trip-member-days", () => ({
  setMemberDayAction: vi.fn(),
}));

import { setMemberDayAction } from "@/lib/actions/trip-member-days";

const mockSet = vi.mocked(setMemberDayAction);

const TRIP_ID = "11111111-1111-4111-8111-111111111111";

const INBOUND: LegDaySuggestions = {
  kind: "inbound",
  legDayIso: "2026-08-14",
  days: [
    { date: "2026-08-14", status: "going" },
    { date: "2026-08-15", status: "going" },
  ],
};

const OUTBOUND: LegDaySuggestions = {
  kind: "outbound",
  legDayIso: "2026-08-16",
  days: [{ date: "2026-08-17", status: "declined" }],
};

describe("LegDaySuggestPrompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSet.mockResolvedValue({ ok: true, status: "going" });
  });

  it("renders the inbound line with day + range in the lowercase register", () => {
    render(
      <LegDaySuggestPrompt
        tripId={TRIP_ID}
        suggestions={INBOUND}
        onDone={() => {}}
      />
    );
    expect(
      screen.getByText("You land fri 14 — mark fri 14 – sat 15 as around?")
    ).toBeInTheDocument();
    expect(screen.getByText("Mark it")).toBeInTheDocument();
  });

  it("renders the outbound line and clear CTA", () => {
    render(
      <LegDaySuggestPrompt
        tripId={TRIP_ID}
        suggestions={OUTBOUND}
        onDone={() => {}}
      />
    );
    expect(
      screen.getByText("You head out sun 16 — clear the days after?")
    ).toBeInTheDocument();
    expect(screen.getByText("Clear them")).toBeInTheDocument();
  });

  it("apply calls setMemberDayAction once per day with fresh idempotency keys, then onDone(true)", async () => {
    const onDone = vi.fn();
    render(
      <LegDaySuggestPrompt
        tripId={TRIP_ID}
        suggestions={INBOUND}
        onDone={onDone}
      />
    );

    fireEvent.click(screen.getByText("Mark it"));

    await waitFor(() => expect(onDone).toHaveBeenCalledWith(true));
    expect(mockSet).toHaveBeenCalledTimes(2);
    expect(mockSet).toHaveBeenNthCalledWith(
      1,
      { tripId: TRIP_ID, date: "2026-08-14", status: "going" },
      expect.any(String)
    );
    expect(mockSet).toHaveBeenNthCalledWith(
      2,
      { tripId: TRIP_ID, date: "2026-08-15", status: "going" },
      expect.any(String)
    );
    const keys = mockSet.mock.calls.map((c) => c[1]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("dismiss calls onDone(false) without writing", () => {
    const onDone = vi.fn();
    render(
      <LegDaySuggestPrompt
        tripId={TRIP_ID}
        suggestions={INBOUND}
        onDone={onDone}
      />
    );

    fireEvent.click(screen.getByText("Leave it"));

    expect(onDone).toHaveBeenCalledWith(false);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("a failed day stops the run, shows the error line, and does NOT resolve", async () => {
    const onDone = vi.fn();
    mockSet
      .mockResolvedValueOnce({ ok: true, status: "going" })
      .mockResolvedValueOnce({ ok: false, errorKey: "network" });
    render(
      <LegDaySuggestPrompt
        tripId={TRIP_ID}
        suggestions={INBOUND}
        onDone={onDone}
      />
    );

    fireEvent.click(screen.getByText("Mark it"));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(onDone).not.toHaveBeenCalled();
    // Retry affordance survives.
    expect(screen.getByText("Mark it")).toBeEnabled();
  });
});
