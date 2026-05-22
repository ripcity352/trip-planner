/**
 * Unit tests for ArrivalsManifest — TDD RED phase.
 * Written before implementation.
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ArrivalsManifest } from "../arrivals-manifest";
import type { TravelLeg, TripMember } from "@/lib/db/types";

// Mock next/navigation — ArrivalsManifest calls useRouter for refresh.
// Capture the refresh spy via module-scoped mock so a test can assert it.
const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

// Mock TravelLegCard
vi.mock("../travel-leg-card", () => ({
  TravelLegCard: ({
    leg,
    ownerName,
  }: {
    leg: TravelLeg;
    myTripMemberId: string;
    ownerName: string;
  }) => (
    <div data-testid="travel-leg-card" data-leg-id={leg.id}>
      {ownerName}
    </div>
  ),
}));

// Mock TravelLegFormSheet — exposes a hook on the rendered button that the
// test can fire to verify ArrivalsManifest's onMutated wires to router.refresh().
vi.mock("../travel-leg-form-sheet", () => ({
  TravelLegFormSheet: ({
    tripId,
    onMutated,
  }: {
    tripId: string;
    onMutated?: () => void;
  }) => (
    <button
      data-testid="add-leg-sheet"
      data-trip-id={tripId}
      onClick={() => onMutated?.()}
    >
      Add a leg
    </button>
  ),
}));

const makeLeg = (overrides: Partial<TravelLeg> = {}): TravelLeg => ({
  id: "leg-1",
  trip_id: "trip-1",
  trip_member_id: "member-1",
  kind: "flight",
  depart_at: null,
  arrive_at: "2026-08-14T10:30:00Z",
  carrier: "Southwest",
  confirmation_code: null,
  notes: null,
  idempotency_key: null,
  created_at: "2026-05-20T00:00:00Z",
  ...overrides,
});

const makeMember = (overrides: Partial<TripMember> = {}): TripMember => ({
  id: "member-1",
  trip_id: "trip-1",
  user_id: "user-1",
  role: "attendee",
  rsvp_status: "going",
  joined_at: "2026-05-20T00:00:00Z",
  is_celebrant: false,
  display_name: "Dave",
  phone_e164: null,
  email: null,
  idempotency_key: null,
  ...overrides,
});

describe("ArrivalsManifest", () => {
  beforeEach(() => {
    mockRefresh.mockReset();
  });

  it("calls router.refresh() when the form sheet fires onMutated (the reason this is a client component)", () => {
    render(
      <ArrivalsManifest
        tripId="trip-1"
        legs={[]}
        myTripMemberId="member-1"
        tripMembers={[makeMember()]}
      />
    );
    fireEvent.click(screen.getByTestId("add-leg-sheet"));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("renders the empty state when no legs exist", () => {
    render(
      <ArrivalsManifest
        tripId="trip-1"
        legs={[]}
        myTripMemberId="member-1"
        tripMembers={[makeMember()]}
      />
    );
    expect(
      screen.getByText(
        "Nobody's logged travel yet. Drop yours so we know when you land."
      )
    ).toBeInTheDocument();
  });

  it("renders a TravelLegCard for each leg", () => {
    const legs = [
      makeLeg({ id: "leg-1", trip_member_id: "member-1" }),
      makeLeg({ id: "leg-2", trip_member_id: "member-2" }),
    ];
    const members = [
      makeMember({ id: "member-1", display_name: "Dave" }),
      makeMember({ id: "member-2", display_name: "Pete" }),
    ];

    render(
      <ArrivalsManifest
        tripId="trip-1"
        legs={legs}
        myTripMemberId="member-1"
        tripMembers={members}
      />
    );

    const cards = screen.getAllByTestId("travel-leg-card");
    expect(cards).toHaveLength(2);
  });

  it("renders the 'Add a leg' CTA", () => {
    render(
      <ArrivalsManifest
        tripId="trip-1"
        legs={[]}
        myTripMemberId="member-1"
        tripMembers={[makeMember()]}
      />
    );
    expect(screen.getByTestId("add-leg-sheet")).toBeInTheDocument();
  });

  it("passes the correct ownerName to each TravelLegCard", () => {
    const legs = [makeLeg({ id: "leg-1", trip_member_id: "member-1" })];
    const members = [makeMember({ id: "member-1", display_name: "Dave" })];

    render(
      <ArrivalsManifest
        tripId="trip-1"
        legs={legs}
        myTripMemberId="member-1"
        tripMembers={members}
      />
    );

    expect(screen.getByText("Dave")).toBeInTheDocument();
  });

  // #162 — display_name is null: fall back to email, not "Someone"
  it("falls back to email when member display_name is null but email is set", () => {
    const legs = [makeLeg({ id: "leg-1", trip_member_id: "member-1" })];
    const members = [
      makeMember({
        id: "member-1",
        display_name: null,
        email: "dave@example.com",
      }),
    ];

    render(
      <ArrivalsManifest
        tripId="trip-1"
        legs={legs}
        myTripMemberId="member-1"
        tripMembers={members}
      />
    );

    // Must show email, not "Someone"
    expect(screen.getByText("dave@example.com")).toBeInTheDocument();
    expect(screen.queryByText("Someone")).not.toBeInTheDocument();
  });

  // #162 — both display_name and email are null: fall back to member id, not "Someone"
  it("falls back to member id when display_name and email are both null", () => {
    const legs = [makeLeg({ id: "leg-1", trip_member_id: "member-1" })];
    const members = [
      makeMember({ id: "member-1", display_name: null, email: null }),
    ];

    render(
      <ArrivalsManifest
        tripId="trip-1"
        legs={legs}
        myTripMemberId="member-1"
        tripMembers={members}
      />
    );

    expect(screen.getByText("member-1")).toBeInTheDocument();
    expect(screen.queryByText("Someone")).not.toBeInTheDocument();
  });

  it("falls back to trip_member_id when leg owner is not in tripMembers", () => {
    const legs = [makeLeg({ id: "leg-1", trip_member_id: "member-unknown" })];
    const members = [makeMember({ id: "member-1", display_name: "Dave" })];

    render(
      <ArrivalsManifest
        tripId="trip-1"
        legs={legs}
        myTripMemberId="member-1"
        tripMembers={members}
      />
    );

    // The card renders with the raw id as final fallback
    expect(screen.getByText("member-unknown")).toBeInTheDocument();
  });

  it("does not render empty state when legs exist", () => {
    render(
      <ArrivalsManifest
        tripId="trip-1"
        legs={[makeLeg()]}
        myTripMemberId="member-1"
        tripMembers={[makeMember()]}
      />
    );

    expect(
      screen.queryByText(
        "No legs logged yet. Drop yours and we'll see the manifest."
      )
    ).not.toBeInTheDocument();
  });
});
