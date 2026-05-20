/**
 * Unit tests for ArrivalsManifest — TDD RED phase.
 * Written before implementation.
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ArrivalsManifest } from "../arrivals-manifest";
import type { TravelLeg, TripMember } from "@/lib/db/types";

// Mock next/navigation — ArrivalsManifest calls useRouter for refresh
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
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

// Mock TravelLegFormSheet
vi.mock("../travel-leg-form-sheet", () => ({
  TravelLegFormSheet: ({ tripId }: { tripId: string }) => (
    <button data-testid="add-leg-sheet" data-trip-id={tripId}>
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
        "No legs logged yet. Drop yours and we'll see the manifest."
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

  it("falls back to 'Someone' when member display_name is null", () => {
    const legs = [makeLeg({ id: "leg-1", trip_member_id: "member-1" })];
    const members = [makeMember({ id: "member-1", display_name: null })];

    render(
      <ArrivalsManifest
        tripId="trip-1"
        legs={legs}
        myTripMemberId="member-1"
        tripMembers={members}
      />
    );

    expect(screen.getByText("Someone")).toBeInTheDocument();
  });

  it("falls back to 'Someone' when leg owner is not in tripMembers", () => {
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

    // The card should still render with fallback name
    expect(screen.getByTestId("travel-leg-card")).toBeInTheDocument();
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
