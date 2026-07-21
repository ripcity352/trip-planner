/**
 * Unit tests for TravelLegFormSheet — TDD RED phase.
 * Tests the sheet toggle behavior and form mounting.
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TravelLegFormSheet } from "../travel-leg-form-sheet";
import type { TravelLeg } from "@/lib/db/types";

// Mock TravelLegForm — behavior tested separately
vi.mock("../travel-leg-form", () => ({
  TravelLegForm: ({
    onCancel,
    leg,
    direction,
    tripTimezone,
  }: {
    tripId: string;
    leg?: TravelLeg;
    direction?: "inbound" | "outbound";
    tripTimezone: string;
    onSuccess: () => void;
    onCancel: () => void;
  }) => (
    <div
      data-testid="travel-leg-form"
      data-has-leg={!!leg}
      data-direction={direction}
      data-trip-timezone={tripTimezone}
    >
      <button onClick={onCancel}>Cancel</button>
    </div>
  ),
}));

describe("TravelLegFormSheet — add mode (no leg prop)", () => {
  // #477: the add flow starts from two section CTAs.
  it("renders the 'Getting there' and 'Heading home' CTAs initially", () => {
    render(<TravelLegFormSheet tripId="trip-1" tripTimezone="UTC" />);
    expect(
      screen.getByRole("button", { name: "Getting there" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Heading home" })
    ).toBeInTheDocument();
  });

  it("form is not visible initially", () => {
    render(<TravelLegFormSheet tripId="trip-1" tripTimezone="UTC" />);
    expect(screen.queryByTestId("travel-leg-form")).not.toBeInTheDocument();
  });

  it("opens the form with direction=inbound from the 'Getting there' CTA", () => {
    render(<TravelLegFormSheet tripId="trip-1" tripTimezone="UTC" />);
    fireEvent.click(screen.getByRole("button", { name: "Getting there" }));
    const form = screen.getByTestId("travel-leg-form");
    expect(form).toBeInTheDocument();
    expect(form).toHaveAttribute("data-direction", "inbound");
  });

  it("opens the form with direction=outbound from the 'Heading home' CTA", () => {
    render(<TravelLegFormSheet tripId="trip-1" tripTimezone="UTC" />);
    fireEvent.click(screen.getByRole("button", { name: "Heading home" }));
    expect(screen.getByTestId("travel-leg-form")).toHaveAttribute(
      "data-direction",
      "outbound"
    );
  });

  it("hides the form when cancel is clicked inside the form", () => {
    render(<TravelLegFormSheet tripId="trip-1" tripTimezone="UTC" />);
    fireEvent.click(screen.getByRole("button", { name: "Getting there" }));
    expect(screen.getByTestId("travel-leg-form")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByTestId("travel-leg-form")).not.toBeInTheDocument();
  });
});

describe("TravelLegFormSheet — edit mode (leg prop present)", () => {
  const leg: TravelLeg = {
    id: "leg-1",
    trip_id: "trip-1",
    trip_member_id: "member-1",
    kind: "flight",
    depart_at: null,
    arrive_at: null,
    carrier: "Delta",
    confirmation_code: null,
    notes: null,
    idempotency_key: null,
    created_at: "2026-05-20T00:00:00Z",
    direction: "inbound",
    airport: null,
    origin_label: null,
  };

  it("renders the edit CTA button", () => {
    render(<TravelLegFormSheet tripId="trip-1" tripTimezone="UTC" leg={leg} />);
    expect(
      screen.getByRole("button", { name: /edit/i })
    ).toBeInTheDocument();
  });

  it("form is not visible initially in edit mode", () => {
    render(<TravelLegFormSheet tripId="trip-1" tripTimezone="UTC" leg={leg} />);
    expect(screen.queryByTestId("travel-leg-form")).not.toBeInTheDocument();
  });

  it("shows the form with leg data when edit CTA is clicked", () => {
    render(<TravelLegFormSheet tripId="trip-1" tripTimezone="UTC" leg={leg} />);
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    const form = screen.getByTestId("travel-leg-form");
    expect(form).toBeInTheDocument();
    expect(form).toHaveAttribute("data-has-leg", "true");
  });

  // #382: the sheet must forward the trip's timezone so the form parses
  // datetime-local input as trip-local wall clock.
  it("forwards tripTimezone to the form", () => {
    render(
      <TravelLegFormSheet
        tripId="trip-1"
        tripTimezone="America/Los_Angeles"
        leg={leg}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    expect(screen.getByTestId("travel-leg-form")).toHaveAttribute(
      "data-trip-timezone",
      "America/Los_Angeles"
    );
  });
});
