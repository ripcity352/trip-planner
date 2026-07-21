/**
 * Regression tests for ArrivalsManifest — UUID-leak fix (#240).
 *
 * Invariant: when a trip_member_id is NOT in tripMembers, the ownerName
 * passed to TravelLegCard must be the "Guest" fallback, never the raw UUID
 * and never "undefined".
 *
 * Override C: tests live in tests/unit/ only (never under app/).
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import type { TravelLeg, TripMember } from "@/lib/db/types";

// ---- Module mocks -------------------------------------------------------

// useRouter is called by ArrivalsManifest
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ refresh: vi.fn() })),
}));

// TravelLegFormSheet is a sheet — stub it to a minimal element
vi.mock(
  "@/components/trip/arrivals/travel-leg-form-sheet",
  () => ({
    TravelLegFormSheet: () => <div data-testid="leg-form-sheet" />,
  }),
);

// TravelLegCard renders ownerName — render it so we can assert on the text
vi.mock(
  "@/components/trip/arrivals/travel-leg-card",
  () => ({
    TravelLegCard: ({
      ownerName,
      leg,
    }: {
      ownerName: string;
      leg: TravelLeg;
    }) => (
      <div data-testid={`leg-card-${leg.id}`}>
        <span data-testid="owner-name">{ownerName}</span>
      </div>
    ),
  }),
);

import { ArrivalsManifest } from "@/components/trip/arrivals/arrivals-manifest";

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

function makeLeg(tripMemberId: string): TravelLeg {
  return {
    id: "leg-1",
    trip_id: "trip-1",
    trip_member_id: tripMemberId,
    kind: "flight",
    depart_at: null,
    arrive_at: null,
    carrier: null,
    confirmation_code: null,
    notes: null,
    idempotency_key: null,
    created_at: "2026-01-01T00:00:00Z",
    direction: "inbound",
    airport: null,
    origin_label: null,
  };
}

// ---- Tests --------------------------------------------------------------

describe("ArrivalsManifest — UUID-leak regression (#240)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes the member display_name as ownerName when id is in tripMembers", () => {
    render(
      <ArrivalsManifest
        tripId="trip-1"
        legs={[makeLeg(KNOWN_MEMBER_ID)]}
        myTripMemberId={KNOWN_MEMBER_ID}
        tripMembers={[knownMember]}
        tripTimezone="UTC"
      />,
    );

    expect(screen.getByTestId("owner-name").textContent).toBe("Alice");
  });

  it('passes "Guest" fallback as ownerName when member id is NOT in tripMembers — never the raw UUID', () => {
    render(
      <ArrivalsManifest
        tripId="trip-1"
        legs={[makeLeg(UNKNOWN_MEMBER_ID)]}
        myTripMemberId={UNKNOWN_MEMBER_ID}
        tripMembers={[]}
        tripTimezone="UTC"
      />,
    );

    const ownerNameEl = screen.getByTestId("owner-name");
    const fallback = M3_UI_STRINGS.roster_member_fallback_name; // "Guest"
    expect(ownerNameEl.textContent).toBe(fallback);
    expect(ownerNameEl.textContent).not.toBe(UNKNOWN_MEMBER_ID);
    expect(ownerNameEl.textContent).not.toBe("undefined");
  });

  it('passes "Guest" when display_name is null and no email — never the raw UUID', () => {
    const noNameMember: TripMember = {
      ...knownMember,
      display_name: null,
      email: null,
    };

    render(
      <ArrivalsManifest
        tripId="trip-1"
        legs={[makeLeg(KNOWN_MEMBER_ID)]}
        myTripMemberId={KNOWN_MEMBER_ID}
        tripMembers={[noNameMember]}
        tripTimezone="UTC"
      />,
    );

    const ownerNameEl = screen.getByTestId("owner-name");
    const fallback = M3_UI_STRINGS.roster_member_fallback_name; // "Guest"
    expect(ownerNameEl.textContent).toBe(fallback);
    expect(ownerNameEl.textContent).not.toBe(KNOWN_MEMBER_ID);
  });
});

// ---------------------------------------------------------------------------
// #477: two-section manifest — inbound grouped by day, quieter outbound
// section, and the computed ride-share line (no matching engine).
// ---------------------------------------------------------------------------

describe("ArrivalsManifest — two sections (#477)", () => {
  const member = (n: number): TripMember => ({
    ...knownMember,
    id: `aaaaaaaa-0000-0000-0000-00000000000${n}`,
    display_name: `Member ${n}`,
  });

  const legFor = (
    n: number,
    overrides: Partial<TravelLeg> = {},
  ): TravelLeg => ({
    ...makeLeg(member(n).id),
    id: `leg-${n}`,
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderManifest = (legs: TravelLeg[]) =>
    render(
      <ArrivalsManifest
        tripId="trip-1"
        legs={legs}
        myTripMemberId={KNOWN_MEMBER_ID}
        tripMembers={[member(1), member(2), member(3)]}
        tripTimezone="UTC"
      />,
    );

  it("renders inbound legs under trip-local day headings", () => {
    renderManifest([
      legFor(1, { arrive_at: "2026-08-14T10:00:00Z" }),
      legFor(2, { arrive_at: "2026-08-14T18:00:00Z" }),
      legFor(3, { arrive_at: "2026-08-15T09:00:00Z" }),
    ]);

    expect(screen.getByText("Fri, Aug 14")).toBeInTheDocument();
    expect(screen.getByText("Sat, Aug 15")).toBeInTheDocument();
  });

  it('renders the "Heading home" section only when outbound legs exist', () => {
    renderManifest([legFor(1, { arrive_at: "2026-08-14T10:00:00Z" })]);
    expect(
      screen.queryByText(M3_UI_STRINGS.arrivals_section_outbound_heading),
    ).not.toBeInTheDocument();
  });

  it("splits outbound legs into the 'Heading home' section", () => {
    renderManifest([
      legFor(1, { arrive_at: "2026-08-14T10:00:00Z" }),
      legFor(2, {
        direction: "outbound",
        arrive_at: null,
        depart_at: "2026-08-16T08:00:00Z",
      }),
    ]);

    expect(
      screen.getByText(M3_UI_STRINGS.arrivals_section_outbound_heading),
    ).toBeInTheDocument();
    expect(screen.getByTestId("leg-card-leg-1")).toBeInTheDocument();
    expect(screen.getByTestId("leg-card-leg-2")).toBeInTheDocument();
  });

  it("renders the ride-share line when 2+ people land at the same airport within an hour", () => {
    renderManifest([
      legFor(1, { airport: "LAX", arrive_at: "2026-08-14T10:00:00Z" }),
      legFor(2, { airport: "LAX", arrive_at: "2026-08-14T10:40:00Z" }),
      legFor(3, { airport: "LAX", arrive_at: "2026-08-14T10:55:00Z" }),
    ]);

    expect(
      screen.getByText("3 of you land at LAX within an hour — split a ride?"),
    ).toBeInTheDocument();
  });

  it("does not render a ride-share line across different airports", () => {
    renderManifest([
      legFor(1, { airport: "LAX", arrive_at: "2026-08-14T10:00:00Z" }),
      legFor(2, { airport: "BUR", arrive_at: "2026-08-14T10:20:00Z" }),
    ]);

    expect(screen.queryByText(/split a ride/)).not.toBeInTheDocument();
  });

  it("does not render a ride-share line for outbound legs", () => {
    renderManifest([
      legFor(1, {
        direction: "outbound",
        airport: "LAX",
        arrive_at: null,
        depart_at: "2026-08-16T08:00:00Z",
      }),
      legFor(2, {
        direction: "outbound",
        airport: "LAX",
        arrive_at: null,
        depart_at: "2026-08-16T08:30:00Z",
      }),
    ]);

    expect(screen.queryByText(/split a ride/)).not.toBeInTheDocument();
  });
});
