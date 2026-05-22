/**
 * Tests for the /trips populated-list header CTA (#236).
 *
 * TDD RED: these tests must fail before the TripsListHeader component
 * is implemented. Run `pnpm test` — expect failures until the CTA is
 * added to the populated list in app/(authed)/trips/page.tsx.
 *
 * Strategy: TripsPage is an async Server Component (can't render in
 * jsdom). Instead, we export TripsListHeader — the section heading +
 * "Start a trip" CTA strip — as a standalone component and test it
 * directly. This is the pattern used by SecurityForm, LodgingRoster,
 * and AnnouncementCard tests in this project.
 *
 * Override C: tests live in tests/unit/ only (never under app/).
 * Override F: no inline string literals — copy sourced from M3_UI_STRINGS.
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { TripsListHeader } from "@/app/(authed)/trips/page";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";

describe("TripsListHeader — populated-list CTA (#236)", () => {
  it('renders the "Your trips" heading', () => {
    render(<TripsListHeader />);
    expect(
      screen.getByRole("heading", { name: "Your trips" }),
    ).toBeInTheDocument();
  });

  it('renders a "Start a trip" CTA link', () => {
    render(<TripsListHeader />);
    const cta = screen.getByRole("link", {
      name: M3_UI_STRINGS.tripsList_newTrip_cta,
    });
    expect(cta).toBeInTheDocument();
  });

  it('CTA link points to "/trips/new"', () => {
    render(<TripsListHeader />);
    const cta = screen.getByRole("link", {
      name: M3_UI_STRINGS.tripsList_newTrip_cta,
    });
    expect(cta).toHaveAttribute("href", "/trips/new");
  });

  it("voice-lock: CTA copy matches M3_UI_STRINGS.tripsList_newTrip_cta exactly", () => {
    // Pins the wire between the page and the copy palette — if W0 key
    // ever drifts, this test catches it before the page re-renders wrong.
    expect(M3_UI_STRINGS.tripsList_newTrip_cta).toBe("Start a trip");
  });
});
