/**
 * Regression tests for LodgingRoster — UUID-leak fix (#240).
 *
 * Invariant: when a trip_member_id is NOT in the memberMap, the rendered
 * output must be the "Guest" fallback string, never the raw UUID, and
 * never "undefined".
 *
 * Override C: tests live in tests/unit/ only (never under app/).
 * Override F: no inline JSX string literals — copy sourced from
 *   M3_UI_STRINGS.roster_member_fallback_name.
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import type { LodgingAssignment, TripMember } from "@/lib/db/types";

// ---- Server action mocks ------------------------------------------------
vi.mock("@/lib/actions/lodging-assignments", () => ({
  assignMemberToLodging: vi.fn(),
  removeLodgingAssignment: vi.fn(),
}));

// ---- Import after mocks -------------------------------------------------
import { LodgingRoster } from "@/components/trip/itinerary/lodging-roster";

// ---- Fixtures -----------------------------------------------------------

const KNOWN_MEMBER_ID = "aaaaaaaa-0000-0000-0000-000000000001";
const UNKNOWN_MEMBER_ID = "bbbbbbbb-dead-beef-0000-000000000002";

const knownMember: TripMember = {
  id: KNOWN_MEMBER_ID,
  trip_id: "trip-1",
  user_id: "user-1",
  role: "attendee",
  rsvp_status: "going",
  joined_at: "2026-01-01T00:00:00Z",
  is_celebrant: false,
  display_name: "Alice",
  phone_e164: null,
  email: "alice@example.com",
  idempotency_key: null,
};

function makeAssignment(tripMemberId: string): LodgingAssignment {
  return {
    id: "assign-1",
    item_id: "item-1",
    trip_member_id: tripMemberId,
    room_label: null,
    created_at: "2026-01-01T00:00:00Z",
  };
}

// ---- Tests --------------------------------------------------------------

describe("LodgingRoster — UUID-leak regression (#240)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the member display_name when the id is in tripMembers", () => {
    render(
      <LodgingRoster
        itemId="item-1"
        assignments={[makeAssignment(KNOWN_MEMBER_ID)]}
        tripMembers={[knownMember]}
        isOrganizer={false}
      />,
    );

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.queryByText(KNOWN_MEMBER_ID)).not.toBeInTheDocument();
  });

  it('renders the "Guest" fallback when the member id is NOT in tripMembers — never the raw UUID', () => {
    render(
      <LodgingRoster
        itemId="item-1"
        assignments={[makeAssignment(UNKNOWN_MEMBER_ID)]}
        tripMembers={[]}
        isOrganizer={false}
      />,
    );

    const fallback = M3_UI_STRINGS.roster_member_fallback_name; // "Guest"
    expect(screen.getByText(fallback)).toBeInTheDocument();
    expect(screen.queryByText(UNKNOWN_MEMBER_ID)).not.toBeInTheDocument();
    expect(screen.queryByText("undefined")).not.toBeInTheDocument();
  });

  it('renders "Guest" fallback when display_name is null AND no email — never the raw UUID', () => {
    // Edge case: member with no display_name and no email → must show "Guest"
    const noNameNoEmailMember: TripMember = {
      ...knownMember,
      display_name: null,
      email: null,
    };

    render(
      <LodgingRoster
        itemId="item-1"
        assignments={[makeAssignment(KNOWN_MEMBER_ID)]}
        tripMembers={[noNameNoEmailMember]}
        isOrganizer={false}
      />,
    );

    const fallback = M3_UI_STRINGS.roster_member_fallback_name; // "Guest"
    expect(screen.getByText(fallback)).toBeInTheDocument();
    expect(screen.queryByText(KNOWN_MEMBER_ID)).not.toBeInTheDocument();
    expect(screen.queryByText("undefined")).not.toBeInTheDocument();
  });

  it("option labels in the assign select never expose a raw UUID", () => {
    const nullNameMember: TripMember = {
      ...knownMember,
      id: UNKNOWN_MEMBER_ID,
      display_name: null,
      email: null,
    };

    render(
      <LodgingRoster
        itemId="item-1"
        assignments={[]}
        tripMembers={[nullNameMember]}
        isOrganizer={true}
      />,
    );

    // Click "Assign a room" to reveal the form + select
    fireEvent.click(screen.getByText(M3_UI_STRINGS.lodging_assign_cta));

    // The select should exist (organizer mode) and options should not show UUIDs
    const select = screen.getByRole("combobox");
    const options = within(select).getAllByRole("option");
    // There's the placeholder + one member option
    for (const option of options) {
      expect(option.textContent).not.toBe(UNKNOWN_MEMBER_ID);
      expect(option.textContent).not.toBe("undefined");
    }
  });
});
