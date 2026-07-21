/**
 * Unit tests for DatePollLinkRow — #470 compact-top relayout.
 *
 * Replaces the old in-feed poll embed. Renders a one-line link to
 * `/dates` only while the trip's dates are undecided.
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DatePollLinkRow } from "../date-poll-link-row";

describe("DatePollLinkRow", () => {
  it("renders the 'still up for a vote' link while the dates are undecided", () => {
    render(<DatePollLinkRow tripSlug="sweep-trip-a" isDecided={false} />);
    const link = screen.getByRole("link", {
      name: /dates are still up for a vote/i,
    });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/trips/sweep-trip-a/dates");
  });

  it("renders nothing once the dates are locked in", () => {
    const { container } = render(
      <DatePollLinkRow tripSlug="sweep-trip-a" isDecided={true} />
    );
    expect(container.firstChild).toBeNull();
  });
});
