/**
 * Unit tests for OrganizerMemberDaysPanel (#550) — the organizer-side
 * write-on-behalf editor for a member's day-availability chips.
 *
 * Verifies: renders nothing with no eligible targets; collapsed by default;
 * a target must be picked before chips show; tapping a chip writes through
 * `setMemberDayForAction` with the target member id; optimistic press.
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { OrganizerMemberDaysPanel } from "../organizer-member-days-panel";

vi.mock("@/lib/actions/trip-member-days", () => ({
  setMemberDayForAction: vi.fn(),
}));

import { setMemberDayForAction } from "@/lib/actions/trip-member-days";

const mockSetFor = vi.mocked(setMemberDayForAction);

const TRIP_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_ID = "22222222-2222-4222-8222-222222222222";

const TARGETS = [
  {
    id: TARGET_ID,
    name: "Rob",
    days: [
      { date: "2026-08-13", status: null },
      { date: "2026-08-14", status: "going" as const },
    ],
  },
];

describe("OrganizerMemberDaysPanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockSetFor.mockResolvedValue({ ok: true, status: "going" });
  });

  it("renders nothing when there are no eligible targets", () => {
    const { container } = render(
      <OrganizerMemberDaysPanel tripId={TRIP_ID} targets={[]} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("is collapsed by default — the picker is not shown until expanded", () => {
    render(<OrganizerMemberDaysPanel tripId={TRIP_ID} targets={TARGETS} />);
    expect(
      screen.getByRole("button", { name: /set someone's days/i })
    ).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("thu 13")).not.toBeInTheDocument();
  });

  it("shows the target's chips only after a member is picked", () => {
    render(<OrganizerMemberDaysPanel tripId={TRIP_ID} targets={TARGETS} />);
    fireEvent.click(screen.getByRole("button", { name: /set someone's days/i }));
    // Expanded, but no member picked yet — no chips.
    expect(screen.queryByText("thu 13")).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: TARGET_ID },
    });
    // Now the target's day chips render; the 'going' day is pressed.
    expect(screen.getByText("thu 13")).toBeInTheDocument();
    expect(screen.getByText("fri 14").closest("button")).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("tapping a chip writes on the target's behalf via setMemberDayForAction", async () => {
    render(<OrganizerMemberDaysPanel tripId={TRIP_ID} targets={TARGETS} />);
    fireEvent.click(screen.getByRole("button", { name: /set someone's days/i }));
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: TARGET_ID },
    });
    fireEvent.click(screen.getByText("thu 13"));

    await waitFor(() => {
      expect(mockSetFor).toHaveBeenCalledWith(
        {
          tripId: TRIP_ID,
          targetTripMemberId: TARGET_ID,
          date: "2026-08-13",
          status: "going",
        },
        expect.any(String)
      );
    });
  });
});
