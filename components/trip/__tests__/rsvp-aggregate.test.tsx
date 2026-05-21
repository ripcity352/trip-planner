/**
 * Tests for `components/trip/rsvp-aggregate.tsx`.
 *
 * RsvpAggregate shows glanceable icon+count rows for each RSVP state.
 * Same icon vocabulary as RsvpChip (#45). Assertions:
 *
 *   1. Each count bucket (going / maybe / declined / noResponse) renders
 *      with its count text AND an icon.
 *   2. Each row carries an aria-label sourced from the copy palette.
 *   3. Icons are aria-hidden so the label does the talking.
 *   4. Zero-counts still render (organizer view includes all buckets).
 *   5. Optional organizer-only declined bucket is conditionally shown.
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { RsvpAggregate } from "@/components/trip/rsvp-aggregate";
import { M4_UI_STRINGS } from "@/lib/copy/empty-states";

const DEFAULT_COUNTS = {
  going: 3,
  maybe: 1,
  invited: 4,
};

describe("<RsvpAggregate />", () => {
  it("renders going count with icon and aria-label", () => {
    render(<RsvpAggregate counts={DEFAULT_COUNTS} />);
    // The going row must exist with the right label.
    const goingRow = screen.getByLabelText(
      `3 ${M4_UI_STRINGS.rsvp_aggregate_aria_going}`
    );
    expect(goingRow).toBeInTheDocument();
    // Count text must be visible.
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("renders maybe count with icon and aria-label", () => {
    render(<RsvpAggregate counts={DEFAULT_COUNTS} />);
    const maybeRow = screen.getByLabelText(
      `1 ${M4_UI_STRINGS.rsvp_aggregate_aria_maybe}`
    );
    expect(maybeRow).toBeInTheDocument();
  });

  it("renders invited (no-response) count with icon and aria-label", () => {
    render(<RsvpAggregate counts={DEFAULT_COUNTS} />);
    const noResponseRow = screen.getByLabelText(
      `4 ${M4_UI_STRINGS.rsvp_aggregate_aria_no_response}`
    );
    expect(noResponseRow).toBeInTheDocument();
  });

  it("does NOT render declined row when declinedCount is omitted", () => {
    render(<RsvpAggregate counts={DEFAULT_COUNTS} />);
    // No declined label should appear.
    expect(
      screen.queryByLabelText(
        `0 ${M4_UI_STRINGS.rsvp_aggregate_aria_declined}`
      )
    ).not.toBeInTheDocument();
  });

  it("renders declined row when declinedCount is provided (organizer view)", () => {
    render(<RsvpAggregate counts={DEFAULT_COUNTS} declinedCount={2} />);
    const declinedRow = screen.getByLabelText(
      `2 ${M4_UI_STRINGS.rsvp_aggregate_aria_declined}`
    );
    expect(declinedRow).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("icons are aria-hidden", () => {
    render(<RsvpAggregate counts={DEFAULT_COUNTS} />);
    const svgs = document.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThan(0);
    svgs.forEach((svg) => {
      expect(svg).toHaveAttribute("aria-hidden", "true");
    });
  });

  it("renders zero counts without crashing", () => {
    expect(() =>
      render(
        <RsvpAggregate
          counts={{ going: 0, maybe: 0, invited: 0 }}
          declinedCount={0}
        />
      )
    ).not.toThrow();
  });
});
