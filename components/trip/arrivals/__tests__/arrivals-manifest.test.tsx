/**
 * Unit tests for ArrivalsManifest — TDD RED phase.
 * Written before implementation.
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ArrivalsManifest } from "../arrivals-manifest";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import type { TravelLeg, TripMember } from "@/lib/db/types";

// Mock next/navigation — ArrivalsManifest calls useRouter for refresh.
// Capture the refresh spy via module-scoped mock so a test can assert it.
const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

// Mock TravelLegCard — exposes onMutated on a button so tests can verify
// the per-card edit path is wired to router.refresh (#452).
vi.mock("../travel-leg-card", () => ({
  TravelLegCard: ({
    leg,
    ownerName,
    onMutated,
    addCandidates,
  }: {
    leg: TravelLeg;
    myTripMemberId: string;
    ownerName: string;
    tripTimezone: string;
    onMutated?: () => void;
    addCandidates?: ReadonlyArray<{ id: string; name: string }>;
  }) => (
    <div
      data-testid="travel-leg-card"
      data-leg-id={leg.id}
      data-add-candidates={(addCandidates ?? []).map((c) => c.id).join(",")}
    >
      {ownerName}
      <button
        data-testid={`card-mutated-${leg.id}`}
        onClick={() => onMutated?.()}
      >
        card mutated
      </button>
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
  direction: "inbound",
  airport: null,
  origin_label: null,
  written_by_trip_member_id: null,
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

// #579 — the view toggle persists to localStorage; clear it between tests so
// a test that flips to Full doesn't leak the preference into the next.
beforeEach(() => {
  window.localStorage.clear();
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
        tripTimezone="UTC"
        myDays={[]}
        tripStartsAt={null}
        tripEndsAt={null}
      />
    );
    fireEvent.click(screen.getByTestId("add-leg-sheet"));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  // #452: the per-card edit/delete sheet never refreshed the page — the
  // card rendered TravelLegFormSheet without onMutated, so deleted/edited
  // legs sat stale on screen until a manual reload. handleMutated must be
  // threaded into every TravelLegCard.
  it("threads router.refresh into each TravelLegCard via onMutated (#452)", () => {
    render(
      <ArrivalsManifest
        tripId="trip-1"
        legs={[makeLeg({ id: "leg-1" })]}
        myTripMemberId="member-1"
        tripMembers={[makeMember()]}
        tripTimezone="UTC"
        myDays={[]}
        tripStartsAt={null}
        tripEndsAt={null}
      />
    );
    // Cards only render in Full view (#579 — Compact is the default glance).
    fireEvent.click(
      screen.getByRole("button", {
        name: M3_UI_STRINGS.arrivals_view_toggle_full,
      })
    );
    fireEvent.click(screen.getByTestId("card-mutated-leg-1"));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("renders the empty state when no legs exist", () => {
    render(
      <ArrivalsManifest
        tripId="trip-1"
        legs={[]}
        myTripMemberId="member-1"
        tripMembers={[makeMember()]}
        tripTimezone="UTC"
        myDays={[]}
        tripStartsAt={null}
        tripEndsAt={null}
      />
    );
    expect(
      screen.getByText(
        "Nobody's logged travel yet. Drop yours so we know when you land."
      )
    ).toBeInTheDocument();
  });

  it("renders a TravelLegCard for each leg in Full view", () => {
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
        tripTimezone="UTC"
        myDays={[]}
        tripStartsAt={null}
        tripEndsAt={null}
      />
    );

    // #579 — Compact is the default: no cards until Full is selected.
    expect(screen.queryAllByTestId("travel-leg-card")).toHaveLength(0);
    fireEvent.click(
      screen.getByRole("button", {
        name: M3_UI_STRINGS.arrivals_view_toggle_full,
      })
    );
    const cards = screen.getAllByTestId("travel-leg-card");
    expect(cards).toHaveLength(2);
  });

  // #579 — Compact is the default density: read-only rows, no detail cards.
  it("defaults to Compact — renders rows with time · name (airport), not cards", () => {
    const legs = [
      makeLeg({
        id: "leg-1",
        trip_member_id: "member-1",
        arrive_at: "2026-08-14T17:30:00Z",
        airport: "LAX",
      }),
    ];
    const members = [makeMember({ id: "member-1", display_name: "Dave" })];

    render(
      <ArrivalsManifest
        tripId="trip-1"
        legs={legs}
        myTripMemberId="member-1"
        tripMembers={members}
        tripTimezone="America/Los_Angeles"
        myDays={[]}
        tripStartsAt={null}
        tripEndsAt={null}
      />
    );

    expect(screen.queryAllByTestId("travel-leg-card")).toHaveLength(0);
    expect(screen.getByText("Dave")).toBeInTheDocument();
    expect(screen.getByText("(LAX)")).toBeInTheDocument();
    expect(screen.getByText("10:30 am")).toBeInTheDocument();
  });

  // #579 — the day header adopts the lowercase-mono register (`fri 14`),
  // replacing the pre-#579 uppercase `Fri, Aug 14` eyebrow (an anti-tell).
  it("renders day headers in the lowercase-mono register, not the uppercase eyebrow", () => {
    render(
      <ArrivalsManifest
        tripId="trip-1"
        legs={[makeLeg({ arrive_at: "2026-08-14T17:30:00Z" })]}
        myTripMemberId="member-1"
        tripMembers={[makeMember()]}
        tripTimezone="America/Los_Angeles"
        myDays={[]}
        tripStartsAt={null}
        tripEndsAt={null}
      />
    );
    expect(screen.getByText("fri 14")).toBeInTheDocument();
    expect(screen.queryByText("Fri, Aug 14")).not.toBeInTheDocument();
  });

  // #579 (operator call) — unconfirmed co-traveler tags render as normal
  // compact rows: no "unconfirmed" marker in the glance.
  it("renders a pending co-traveler tag as a normal compact row (no 'unconfirmed' marker)", () => {
    const legs = [
      makeLeg({
        id: "leg-1",
        trip_member_id: "member-2",
        written_by_trip_member_id: "member-1",
        arrive_at: "2026-08-14T17:30:00Z",
        airport: "LAX",
      }),
    ];
    const members = [
      makeMember({ id: "member-1", display_name: "Dave" }),
      makeMember({ id: "member-2", display_name: "Pete" }),
    ];

    render(
      <ArrivalsManifest
        tripId="trip-1"
        legs={legs}
        myTripMemberId="member-9"
        tripMembers={members}
        tripTimezone="America/Los_Angeles"
        myDays={[]}
        tripStartsAt={null}
        tripEndsAt={null}
      />
    );

    expect(screen.getByText("Pete")).toBeInTheDocument();
    expect(screen.queryByText(/unconfirmed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/added by/i)).not.toBeInTheDocument();
  });

  it("renders the 'Add a leg' CTA", () => {
    render(
      <ArrivalsManifest
        tripId="trip-1"
        legs={[]}
        myTripMemberId="member-1"
        tripMembers={[makeMember()]}
        tripTimezone="UTC"
        myDays={[]}
        tripStartsAt={null}
        tripEndsAt={null}
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
        tripTimezone="UTC"
        myDays={[]}
        tripStartsAt={null}
        tripEndsAt={null}
      />
    );

    expect(screen.getByText("Dave")).toBeInTheDocument();
  });

  // #240 — display_name is null: resolveMemberName falls back to "Guest",
  // never email or raw id (W1a decision: email is PII, id is a UUID leak).
  it("falls back to 'Guest' when member display_name is null (even if email is set)", () => {
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
        tripTimezone="UTC"
        myDays={[]}
        tripStartsAt={null}
        tripEndsAt={null}
      />
    );

    // resolveMemberName reads only display_name; "Guest" is the fallback
    expect(screen.getByText("Guest")).toBeInTheDocument();
    expect(screen.queryByText("dave@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText("Someone")).not.toBeInTheDocument();
  });

  // #240 — both display_name and email are null: "Guest", not raw id
  it("falls back to 'Guest' when display_name and email are both null — never the raw id", () => {
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
        tripTimezone="UTC"
        myDays={[]}
        tripStartsAt={null}
        tripEndsAt={null}
      />
    );

    expect(screen.getByText("Guest")).toBeInTheDocument();
    expect(screen.queryByText("member-1")).not.toBeInTheDocument();
    expect(screen.queryByText("Someone")).not.toBeInTheDocument();
  });

  it("falls back to 'Guest' when leg owner is not in tripMembers — never the raw UUID", () => {
    const legs = [makeLeg({ id: "leg-1", trip_member_id: "member-unknown" })];
    const members = [makeMember({ id: "member-1", display_name: "Dave" })];

    render(
      <ArrivalsManifest
        tripId="trip-1"
        legs={legs}
        myTripMemberId="member-1"
        tripMembers={members}
        tripTimezone="UTC"
        myDays={[]}
        tripStartsAt={null}
        tripEndsAt={null}
      />
    );

    // resolveMemberName returns "Guest" when id not in map
    expect(screen.getByText("Guest")).toBeInTheDocument();
    expect(screen.queryByText("member-unknown")).not.toBeInTheDocument();
  });

  it("does not render empty state when legs exist", () => {
    render(
      <ArrivalsManifest
        tripId="trip-1"
        legs={[makeLeg()]}
        myTripMemberId="member-1"
        tripMembers={[makeMember()]}
        tripTimezone="UTC"
        myDays={[]}
        tripStartsAt={null}
        tripEndsAt={null}
      />
    );

    expect(
      screen.queryByText(
        "No legs logged yet. Drop yours and we'll see the manifest."
      )
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// #477: two-section manifest — inbound grouped by day, quieter outbound
// section, and the computed ride-share line (no matching engine).
// ---------------------------------------------------------------------------

describe("ArrivalsManifest — two sections (#477)", () => {
  const member = (n: number): TripMember =>
    makeMember({
      id: `member-${n}`,
      display_name: `Member ${n}`,
    });

  const legFor = (n: number, overrides: Partial<TravelLeg> = {}): TravelLeg =>
    makeLeg({
      id: `leg-${n}`,
      trip_member_id: member(n).id,
      ...overrides,
    });

  const renderManifest = (legs: TravelLeg[]) =>
    render(
      <ArrivalsManifest
        tripId="trip-1"
        legs={legs}
        myTripMemberId="member-1"
        tripMembers={[member(1), member(2), member(3)]}
        tripTimezone="UTC"
        myDays={[]}
        tripStartsAt={null}
        tripEndsAt={null}
      />
    );

  it("renders inbound legs under trip-local day headings (lowercase-mono register)", () => {
    renderManifest([
      legFor(1, { arrive_at: "2026-08-14T10:00:00Z" }),
      legFor(2, { arrive_at: "2026-08-14T18:00:00Z" }),
      legFor(3, { arrive_at: "2026-08-15T09:00:00Z" }),
    ]);

    expect(screen.getByText("fri 14")).toBeInTheDocument();
    expect(screen.getByText("sat 15")).toBeInTheDocument();
  });

  it('renders the "Heading home" section only when outbound legs exist', () => {
    renderManifest([legFor(1, { arrive_at: "2026-08-14T10:00:00Z" })]);
    expect(
      screen.queryByText(M3_UI_STRINGS.arrivals_section_outbound_heading)
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
      screen.getByText(M3_UI_STRINGS.arrivals_section_outbound_heading)
    ).toBeInTheDocument();
    // Card assertions need Full view (#579 — Compact renders rows).
    fireEvent.click(
      screen.getByRole("button", {
        name: M3_UI_STRINGS.arrivals_view_toggle_full,
      })
    );
    const cards = screen.getAllByTestId("travel-leg-card");
    expect(cards.map((c) => c.getAttribute("data-leg-id"))).toEqual(
      expect.arrayContaining(["leg-1", "leg-2"])
    );
  });

  it("renders the ride-share line when 2+ people land at the same airport within an hour", () => {
    renderManifest([
      legFor(1, { airport: "LAX", arrive_at: "2026-08-14T10:00:00Z" }),
      legFor(2, { airport: "LAX", arrive_at: "2026-08-14T10:40:00Z" }),
      legFor(3, { airport: "LAX", arrive_at: "2026-08-14T10:55:00Z" }),
    ]);

    expect(
      screen.getByText("3 of you land at LAX within an hour — split a ride?")
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

  // #574 follow-up — a flight card's "add who's on this" candidates exclude
  // trip decliners and anyone already on the SAME flight (matched by
  // airline + flight number), so you never re-add a passenger.
  it("computes per-card add-candidates, excluding same-flight members and decliners", () => {
    const jusLeg = makeLeg({
      id: "leg-jus",
      trip_member_id: "jus",
      airline_iata: "HA",
      flight_number: "AS840",
    });
    // Jar is already on the SAME flight (HA AS840) → must not be a candidate.
    const jarLeg = makeLeg({
      id: "leg-jar",
      trip_member_id: "jar",
      airline_iata: "HA",
      flight_number: "AS840",
    });

    render(
      <ArrivalsManifest
        tripId="trip-1"
        legs={[jusLeg, jarLeg]}
        myTripMemberId="rip"
        tripMembers={[
          makeMember({ id: "jus", display_name: "Jus" }),
          makeMember({ id: "jar", display_name: "Jar" }),
          makeMember({ id: "mend", display_name: "Mend" }),
          makeMember({ id: "rip", display_name: "Rip" }),
          makeMember({
            id: "out",
            display_name: "Out",
            rsvp_status: "declined",
          }),
        ]}
        tripTimezone="UTC"
        myDays={[]}
        tripStartsAt={null}
        tripEndsAt={null}
      />
    );

    // add-candidates live on the Full card (#579 — Compact rows are read-only).
    fireEvent.click(
      screen.getByRole("button", {
        name: M3_UI_STRINGS.arrivals_view_toggle_full,
      })
    );
    const jusCard = screen
      .getAllByTestId("travel-leg-card")
      .find((el) => el.getAttribute("data-leg-id") === "leg-jus")!;
    const candidateIds = (
      jusCard.getAttribute("data-add-candidates") ?? ""
    ).split(",");
    // Only Mend remains: jus/jar are on the flight, out declined, and rip
    // (the viewer) is never a candidate — adding yourself is the log-your-
    // travel flow (RLS rejects target == writer).
    expect(candidateIds).toContain("mend");
    expect(candidateIds).not.toContain("rip");
    expect(candidateIds).not.toContain("jus");
    expect(candidateIds).not.toContain("jar");
    expect(candidateIds).not.toContain("out");
  });
});
