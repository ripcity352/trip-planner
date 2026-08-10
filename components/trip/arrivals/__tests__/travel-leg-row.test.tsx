/**
 * Unit tests for TravelLegRow (#579) — the compact, read-only arrivals row.
 *
 * One scannable line per leg: `9:50 pm · Rob (PDX)`. Time via the trip-tz
 * register (lowercase am/pm), owner name, airport code in parens. No flight
 * number, origin, notes, or PNR — those live in the Full card only.
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { TravelLegRow } from "../travel-leg-row";
import type { TravelLeg } from "@/lib/db/types";

const TZ = "America/Los_Angeles";

const baseLeg: TravelLeg = {
  id: "leg-1",
  trip_id: "trip-1",
  trip_member_id: "member-rob",
  kind: "flight",
  depart_at: "2026-08-14T15:00:00.000Z",
  arrive_at: "2026-08-15T04:50:00.000Z", // 9:50 pm PDT on the 14th
  carrier: null,
  confirmation_code: "SECRET7",
  notes: "wheels up",
  idempotency_key: null,
  created_at: "2026-05-20T00:00:00.000Z",
  airline_iata: "DL",
  flight_number: "2975",
  direction: "inbound",
  airport: "PDX",
  origin_label: "LAX",
  written_by_trip_member_id: null,
};

function renderRow(leg: TravelLeg, ownerName = "Rob") {
  return render(
    <ul>
      <TravelLegRow leg={leg} ownerName={ownerName} tripTimezone={TZ} />
    </ul>
  );
}

describe("TravelLegRow", () => {
  it("renders time · name (airport) on one line for an inbound leg", () => {
    renderRow(baseLeg);
    // Inbound uses arrive_at → 9:50 pm PDT.
    expect(screen.getByText("9:50 pm")).toBeInTheDocument();
    expect(screen.getByText("Rob")).toBeInTheDocument();
    expect(screen.getByText("(PDX)")).toBeInTheDocument();
  });

  it("uses depart_at for an outbound leg", () => {
    const outbound: TravelLeg = {
      ...baseLeg,
      direction: "outbound",
      depart_at: "2026-08-17T15:05:00.000Z", // 8:05 am PDT
      arrive_at: null,
    };
    renderRow(outbound, "Pete");
    expect(screen.getByText("8:05 am")).toBeInTheDocument();
    expect(screen.getByText("Pete")).toBeInTheDocument();
  });

  it("renders name (and airport) with no time when the instant is TBD", () => {
    const tbd: TravelLeg = { ...baseLeg, arrive_at: null, depart_at: null };
    renderRow(tbd, "Dave");
    expect(screen.getByText("Dave")).toBeInTheDocument();
    expect(screen.getByText("(PDX)")).toBeInTheDocument();
    // No stray time string.
    expect(screen.queryByText(/\d+:\d+\s?(am|pm)/)).not.toBeInTheDocument();
  });

  it("omits the airport parens when no airport is set", () => {
    const noAirport: TravelLeg = { ...baseLeg, airport: null };
    renderRow(noAirport);
    expect(screen.getByText("Rob")).toBeInTheDocument();
    expect(screen.queryByText(/\(/)).not.toBeInTheDocument();
  });

  it("renders am/pm in lowercase (register anti-tell guard)", () => {
    renderRow(baseLeg);
    const time = screen.getByText("9:50 pm");
    expect(time.textContent).not.toMatch(/PM|AM/);
  });

  it("never renders the confirmation code (PNR), flight number, origin, or notes", () => {
    renderRow(baseLeg);
    expect(screen.queryByText(/SECRET7/)).not.toBeInTheDocument();
    expect(screen.queryByText(/2975/)).not.toBeInTheDocument();
    expect(screen.queryByText(/LAX/)).not.toBeInTheDocument();
    expect(screen.queryByText(/wheels up/)).not.toBeInTheDocument();
  });
});
