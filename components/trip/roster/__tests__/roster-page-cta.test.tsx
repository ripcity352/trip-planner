/**
 * Tests for the "Add to the crew" CTA on the roster/crew page (#237).
 *
 * W2a deliverable: RosterList must render an "Add to the crew" CTA for
 * organizers (and co-organizers) that links to the invites surface. Non-
 * organizer members (role="attendee") must NOT see the CTA — invite minting
 * is organizer-only (enforced by the invites page RLS + page-level guard).
 *
 * Copy key: M3_UI_STRINGS.crew_invite_cta ("Add to the crew")
 * Target href: /trips/[tripId]/invites  — passed in as `tripId` prop.
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RosterList } from "../roster-list";
import type { RosterMember } from "../roster-list";

// Mock client sub-components (same as existing roster-list tests).
vi.mock("../vcard-download-button", () => ({
  VCardDownloadButton: ({
    members,
  }: {
    members: { name: string; phone: string }[];
  }) => (
    <button data-testid="vcard-btn">Download contacts ({members.length})</button>
  ),
}));

vi.mock("../copy-numbers-button", () => ({
  CopyNumbersButton: ({ phones }: { phones: string[] }) => (
    <button data-testid="copy-btn">Copy all numbers ({phones.length})</button>
  ),
}));

// next/link renders an <a> in tests.
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const organizerMember: RosterMember = {
  id: "m1",
  displayName: "Alice",
  phone: "+15555550100",
  role: "organizer",
  isCelebrant: false,
};

const attendeeMember: RosterMember = {
  id: "m2",
  displayName: "Bob",
  phone: "+15555550101",
  role: "attendee",
  isCelebrant: false,
};

const coOrganizerMember: RosterMember = {
  id: "m3",
  displayName: "Carol",
  phone: null,
  role: "co_organizer",
  isCelebrant: false,
};

describe("RosterList — crew invite CTA (#237)", () => {
  it('shows "Add to the crew" CTA for an organizer viewer', () => {
    render(
      <RosterList
        members={[organizerMember]}
        tripName="Test Trip"
        tripSlug="test-trip"
        viewerRole="organizer"
      />
    );
    expect(
      screen.getByRole("link", { name: /add to the crew/i })
    ).toBeInTheDocument();
  });

  it('"Add to the crew" CTA links to /trips/[tripSlug]/invites', () => {
    render(
      <RosterList
        members={[organizerMember]}
        tripName="Test Trip"
        tripSlug="test-trip"
        viewerRole="organizer"
      />
    );
    const link = screen.getByRole("link", { name: /add to the crew/i });
    expect(link).toHaveAttribute("href", "/trips/test-trip/invites");
  });

  it('shows "Add to the crew" CTA for a co-organizer viewer', () => {
    render(
      <RosterList
        members={[coOrganizerMember]}
        tripName="Test Trip"
        tripSlug="test-trip"
        viewerRole="co_organizer"
      />
    );
    expect(
      screen.getByRole("link", { name: /add to the crew/i })
    ).toBeInTheDocument();
  });

  it('does NOT show "Add to the crew" CTA for an attendee viewer', () => {
    render(
      <RosterList
        members={[attendeeMember]}
        tripName="Test Trip"
        tripSlug="test-trip"
        viewerRole="attendee"
      />
    );
    expect(
      screen.queryByRole("link", { name: /add to the crew/i })
    ).not.toBeInTheDocument();
  });

  it("CTA copy matches M3_UI_STRINGS.crew_invite_cta", () => {
    render(
      <RosterList
        members={[organizerMember]}
        tripName="Test Trip"
        tripSlug="test-trip"
        viewerRole="organizer"
      />
    );
    const link = screen.getByRole("link", { name: /add to the crew/i });
    expect(link.textContent?.trim()).toBe("Add to the crew");
  });
});
