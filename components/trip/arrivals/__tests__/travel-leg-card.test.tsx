/**
 * Unit tests for TravelLegCard — TDD RED phase.
 * Written before implementation per testing.md workflow.
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TravelLegCard } from "../travel-leg-card";
import type { TravelLeg } from "@/lib/db/types";

// Mock TravelLegFormSheet — tested separately
vi.mock("../travel-leg-form-sheet", () => ({
  TravelLegFormSheet: ({
    leg,
  }: {
    leg: TravelLeg;
  }) => (
    <button data-testid="edit-leg-sheet" data-leg-id={leg.id}>
      Edit
    </button>
  ),
}));

const makeLeg = (overrides: Partial<TravelLeg> = {}): TravelLeg => ({
  id: "leg-1",
  trip_id: "trip-1",
  trip_member_id: "member-1",
  kind: "flight",
  depart_at: "2026-08-14T06:00:00Z",
  arrive_at: "2026-08-14T10:30:00Z",
  carrier: "Southwest",
  confirmation_code: "ABC123",
  notes: "Window seat please",
  idempotency_key: null,
  created_at: "2026-05-20T00:00:00Z",
  ...overrides,
});

describe("TravelLegCard", () => {
  it("renders the carrier name", () => {
    render(
      <TravelLegCard
        leg={makeLeg()}
        myTripMemberId="member-1"
        ownerName="Dave"
        tripTimezone="UTC"
      />
    );
    expect(screen.getByText("Southwest")).toBeInTheDocument();
  });

  it("renders the confirmation code", () => {
    render(
      <TravelLegCard
        leg={makeLeg()}
        myTripMemberId="member-1"
        ownerName="Dave"
        tripTimezone="UTC"
      />
    );
    expect(screen.getByText("ABC123")).toBeInTheDocument();
  });

  it("renders the notes", () => {
    render(
      <TravelLegCard
        leg={makeLeg()}
        myTripMemberId="member-1"
        ownerName="Dave"
        tripTimezone="UTC"
      />
    );
    expect(screen.getByText("Window seat please")).toBeInTheDocument();
  });

  it("renders kind label — flight", () => {
    render(
      <TravelLegCard
        leg={makeLeg({ kind: "flight" })}
        myTripMemberId="member-1"
        ownerName="Dave"
        tripTimezone="UTC"
      />
    );
    expect(screen.getByText("Flight")).toBeInTheDocument();
  });

  it("renders kind label — train", () => {
    render(
      <TravelLegCard
        leg={makeLeg({ kind: "train" })}
        myTripMemberId="member-1"
        ownerName="Dave"
        tripTimezone="UTC"
      />
    );
    expect(screen.getByText("Train")).toBeInTheDocument();
  });

  it("renders kind label — drive", () => {
    render(
      <TravelLegCard
        leg={makeLeg({ kind: "drive" })}
        myTripMemberId="member-1"
        ownerName="Dave"
        tripTimezone="UTC"
      />
    );
    expect(screen.getByText("Drive")).toBeInTheDocument();
  });

  it("renders kind label — other", () => {
    render(
      <TravelLegCard
        leg={makeLeg({ kind: "other" })}
        myTripMemberId="member-1"
        ownerName="Dave"
        tripTimezone="UTC"
      />
    );
    expect(screen.getByText("Other")).toBeInTheDocument();
  });

  it("renders owner name", () => {
    render(
      <TravelLegCard
        leg={makeLeg()}
        myTripMemberId="member-99"
        ownerName="Charlie"
        tripTimezone="UTC"
      />
    );
    expect(screen.getByText("Charlie")).toBeInTheDocument();
  });

  it("renders edit affordance when viewer is the owner", () => {
    render(
      <TravelLegCard
        leg={makeLeg({ trip_member_id: "member-1" })}
        myTripMemberId="member-1"
        ownerName="Dave"
        tripTimezone="UTC"
      />
    );
    expect(screen.getByTestId("edit-leg-sheet")).toBeInTheDocument();
  });

  it("does not render edit affordance for non-owner", () => {
    render(
      <TravelLegCard
        leg={makeLeg({ trip_member_id: "member-1" })}
        myTripMemberId="member-99"
        ownerName="Dave"
        tripTimezone="UTC"
      />
    );
    expect(screen.queryByTestId("edit-leg-sheet")).not.toBeInTheDocument();
  });

  it("renders depart time when present", () => {
    render(
      <TravelLegCard
        leg={makeLeg({ depart_at: "2026-08-14T06:00:00Z" })}
        myTripMemberId="member-99"
        ownerName="Dave"
        tripTimezone="UTC"
      />
    );
    // Just check the "Leave" label is visible (time format verified by util tests)
    expect(screen.getByText("Leave")).toBeInTheDocument();
  });

  it("renders arrive time when present", () => {
    render(
      <TravelLegCard
        leg={makeLeg({ arrive_at: "2026-08-14T10:30:00Z" })}
        myTripMemberId="member-99"
        ownerName="Dave"
        tripTimezone="UTC"
      />
    );
    expect(screen.getByText("Arrive")).toBeInTheDocument();
  });

  it("does not render depart block when depart_at is null", () => {
    render(
      <TravelLegCard
        leg={makeLeg({ depart_at: null })}
        myTripMemberId="member-99"
        ownerName="Dave"
        tripTimezone="UTC"
      />
    );
    expect(screen.queryByText("Leave")).not.toBeInTheDocument();
  });

  it("does not render arrive block when arrive_at is null", () => {
    render(
      <TravelLegCard
        leg={makeLeg({ arrive_at: null })}
        myTripMemberId="member-99"
        ownerName="Dave"
        tripTimezone="UTC"
      />
    );
    expect(screen.queryByText("Arrive")).not.toBeInTheDocument();
  });

  it("does not render carrier section when carrier is null", () => {
    render(
      <TravelLegCard
        leg={makeLeg({ carrier: null })}
        myTripMemberId="member-99"
        ownerName="Dave"
        tripTimezone="UTC"
      />
    );
    expect(screen.queryByText("Southwest")).not.toBeInTheDocument();
  });

  it("does not render confirmation code when null", () => {
    render(
      <TravelLegCard
        leg={makeLeg({ confirmation_code: null })}
        myTripMemberId="member-99"
        ownerName="Dave"
        tripTimezone="UTC"
      />
    );
    expect(screen.queryByText("ABC123")).not.toBeInTheDocument();
  });

  it("does not render notes section when notes is null", () => {
    render(
      <TravelLegCard
        leg={makeLeg({ notes: null })}
        myTripMemberId="member-99"
        ownerName="Dave"
        tripTimezone="UTC"
      />
    );
    expect(screen.queryByText("Window seat please")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// #396: airline_iata + flight_number are stored by the M4 airline picker but
// were never rendered — the card read only the free-text carrier column,
// which the picker path leaves null.
// ---------------------------------------------------------------------------

describe("TravelLegCard — flight number rendering (#396)", () => {
  it("renders 'UA 415' from airline_iata + flight_number when carrier is null", () => {
    render(
      <TravelLegCard
        leg={makeLeg({
          airline_iata: "UA",
          flight_number: "415",
          carrier: null,
        })}
        myTripMemberId="member-99"
        ownerName="Dave"
        tripTimezone="UTC"
      />
    );
    expect(screen.getByText("UA 415")).toBeInTheDocument();
  });

  it("prefers the structured pair over the free-text carrier", () => {
    render(
      <TravelLegCard
        leg={makeLeg({
          airline_iata: "UA",
          flight_number: "415",
          carrier: "Southwest",
        })}
        myTripMemberId="member-99"
        ownerName="Dave"
        tripTimezone="UTC"
      />
    );
    expect(screen.getByText("UA 415")).toBeInTheDocument();
    expect(screen.queryByText("Southwest")).not.toBeInTheDocument();
  });

  it("falls back to the free-text carrier when the pair is null", () => {
    render(
      <TravelLegCard
        leg={makeLeg({
          airline_iata: null,
          flight_number: null,
          carrier: "Amtrak",
          kind: "train",
        })}
        myTripMemberId="member-99"
        ownerName="Dave"
        tripTimezone="UTC"
      />
    );
    expect(screen.getByText("Amtrak")).toBeInTheDocument();
  });

  it("renders nothing on the kind row when both the pair and carrier are null", () => {
    render(
      <TravelLegCard
        leg={makeLeg({
          airline_iata: null,
          flight_number: null,
          carrier: null,
        })}
        myTripMemberId="member-99"
        ownerName="Dave"
        tripTimezone="UTC"
      />
    );
    expect(screen.queryByText(/UA/)).not.toBeInTheDocument();
    expect(screen.queryByText("Southwest")).not.toBeInTheDocument();
  });
});
