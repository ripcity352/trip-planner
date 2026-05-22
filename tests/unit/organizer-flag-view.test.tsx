/**
 * Regression tests for OrganizerFlagView — UUID-leak fix (#240).
 *
 * Invariant: when a memberId key is NOT in the memberNames record (or
 * the resolved name is the raw UUID), the rendered output must be
 * the "Guest" fallback string, never the raw UUID and never "undefined".
 *
 * The component currently takes `memberNames: Record<string, string>`.
 * The fix ships a small adapter that wraps the Record in a ReadonlyMap
 * so resolveMemberName can be called without changing the prop type.
 *
 * Override C: tests live in tests/unit/ only (never under app/).
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import type { ItineraryItemMemberFlag } from "@/lib/db/types";
import { OrganizerFlagView } from "@/components/trip/itinerary/organizer-flag-view";

// ---- Fixtures -----------------------------------------------------------

const KNOWN_MEMBER_ID = "aaaaaaaa-0000-0000-0000-000000000001";
const UNKNOWN_MEMBER_ID = "bbbbbbbb-dead-beef-0000-000000000002";

function makeFlag(tripMemberId: string): ItineraryItemMemberFlag {
  return {
    id: "flag-1",
    item_id: "item-1",
    trip_member_id: tripMemberId,
    flag: "dietary",
    note: null,
    created_at: "2026-01-01T00:00:00Z",
  };
}

// ---- Tests --------------------------------------------------------------

describe("OrganizerFlagView — UUID-leak regression (#240)", () => {
  it("renders the member name when the id is present in memberNames", () => {
    render(
      <OrganizerFlagView
        flags={[makeFlag(KNOWN_MEMBER_ID)]}
        memberNames={{ [KNOWN_MEMBER_ID]: "Alice" }}
      />,
    );

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.queryByText(KNOWN_MEMBER_ID)).not.toBeInTheDocument();
  });

  it('renders "Guest" fallback when the member id is NOT in memberNames — never the raw UUID', () => {
    render(
      <OrganizerFlagView
        flags={[makeFlag(UNKNOWN_MEMBER_ID)]}
        memberNames={{}}
      />,
    );

    const fallback = M3_UI_STRINGS.roster_member_fallback_name; // "Guest"
    expect(screen.getByText(fallback)).toBeInTheDocument();
    expect(screen.queryByText(UNKNOWN_MEMBER_ID)).not.toBeInTheDocument();
    expect(screen.queryByText("undefined")).not.toBeInTheDocument();
  });

  it("renders empty-state message when there are no flags", () => {
    render(
      <OrganizerFlagView
        flags={[]}
        memberNames={{}}
      />,
    );

    expect(
      screen.getByText(M3_UI_STRINGS.itinerary_item_flag_empty_organizer),
    ).toBeInTheDocument();
  });
});
