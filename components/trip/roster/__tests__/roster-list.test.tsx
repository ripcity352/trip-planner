/**
 * Unit tests for RosterList — Server Component rendered as static JSX in tests.
 * TDD: written before implementation.
 *
 * RosterList renders member rows + the two CTA buttons (VCardDownloadButton,
 * CopyNumbersButton). We test the rendered output by mocking the client
 * sub-components so they render as simple DOM nodes.
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RosterList } from "../roster-list";
import type { RosterMember } from "../roster-list";

// Mock client sub-components to avoid testing their internals here
vi.mock("../vcard-download-button", () => ({
  VCardDownloadButton: ({ members }: { members: { name: string; phone: string }[] }) => (
    <button data-testid="vcard-btn">Download contacts ({members.length})</button>
  ),
}));

vi.mock("../copy-numbers-button", () => ({
  CopyNumbersButton: ({ phones }: { phones: string[] }) => (
    <button data-testid="copy-btn">Copy all numbers ({phones.length})</button>
  ),
}));

// #386 — the member-manage client component has its own suite; here we
// only assert WHICH rows get the affordance (and whether the founder's
// celebrant capability was threaded).
vi.mock("../member-manage", () => ({
  MemberManage: ({
    memberId,
    celebrant,
  }: {
    memberId: string;
    celebrant?: { isCelebrant: boolean; currentCelebrantName: string | null };
  }) => (
    <button
      data-testid={`manage-${memberId}`}
      data-celebrant={celebrant ? JSON.stringify(celebrant) : undefined}
    >
      manage
    </button>
  ),
}));

const sampleMembers: RosterMember[] = [
  {
    id: "m1",
    displayName: "Alice",
    phone: "+15555550100",
    role: "organizer",
    isCelebrant: false,
  },
  {
    id: "m2",
    displayName: "Bob",
    phone: "+15555550101",
    role: "attendee",
    isCelebrant: true,
  },
  {
    id: "m3",
    displayName: "Carol",
    phone: null,
    role: "attendee",
    isCelebrant: false,
  },
];

describe("RosterList", () => {
  it("renders all member display names", () => {
    render(<RosterList members={sampleMembers} tripName="Test Trip" />);
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("Carol")).toBeInTheDocument();
  });

  it("passes only members with phone numbers to VCardDownloadButton", () => {
    render(<RosterList members={sampleMembers} tripName="Test Trip" />);
    // Alice + Bob have phones (2); Carol does not
    expect(screen.getByTestId("vcard-btn")).toHaveTextContent(
      "Download contacts (2)"
    );
  });

  it("passes only phone numbers to CopyNumbersButton", () => {
    render(<RosterList members={sampleMembers} tripName="Test Trip" />);
    expect(screen.getByTestId("copy-btn")).toHaveTextContent(
      "Copy all numbers (2)"
    );
  });

  it("renders the empty state when members array is empty", () => {
    render(<RosterList members={[]} tripName="Just Us" />);
    // EMPTY_STATES.members = "Just you so far. The group chat fills in fast."
    expect(
      screen.getByText("Just you so far. The group chat fills in fast.")
    ).toBeInTheDocument();
  });

  it("still renders CTAs even when no members have phones", () => {
    const noPhoneMembers: RosterMember[] = [
      { id: "m1", displayName: "Alice", phone: null, role: "organizer", isCelebrant: false },
    ];
    render(<RosterList members={noPhoneMembers} tripName="Test Trip" />);
    // Buttons still render; they will be disabled (tested in their own tests)
    expect(screen.getByTestId("vcard-btn")).toBeInTheDocument();
    expect(screen.getByTestId("copy-btn")).toBeInTheDocument();
  });

  it("renders the roster heading from M3_UI_STRINGS", () => {
    render(<RosterList members={sampleMembers} tripName="Test Trip" />);
    // M3_UI_STRINGS.roster_heading = "Who's coming"
    expect(screen.getByText("Who's coming")).toBeInTheDocument();
  });

  it("shows organizer role badge for organizer members", () => {
    render(<RosterList members={sampleMembers} tripName="Test Trip" />);
    // organizer member Alice should have a role indicator
    expect(screen.getByText(/organizer/i)).toBeInTheDocument();
  });

  // #F5-partial — own-row "You" affordance (full fix gated behind #348)
  it("renders 'You' for the viewer's own row instead of their display name", () => {
    const withViewer: RosterMember[] = [
      { id: "m1", displayName: "Alice", phone: "+15555550100", role: "organizer", isCelebrant: false, isViewer: true },
      { id: "m2", displayName: "Bob", phone: "+15555550101", role: "attendee", isCelebrant: true },
    ];
    render(<RosterList members={withViewer} tripName="Test Trip" />);
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("renders 'You' for the viewer's own row even when display_name is null", () => {
    const withViewer: RosterMember[] = [
      { id: "m1", displayName: null, phone: null, role: "attendee", isCelebrant: false, isViewer: true },
    ];
    render(<RosterList members={withViewer} tripName="Test Trip" />);
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.queryByText("Guest")).not.toBeInTheDocument();
  });

  // #387 — quiet per-name RSVP state. Anti-shame boundary is BINDING:
  // 'going' renders NOTHING (default row is unmarked); maybe/pending get
  // a hairline chip; declined only surfaces when the view let it through
  // (organizer viewer or own row); a null status (redacted decline)
  // renders exactly like going.
  describe("per-name RSVP chips (#387)", () => {
    const rsvpMembers: RosterMember[] = [
      { id: "m1", displayName: "Alice", phone: null, role: "attendee", isCelebrant: false, rsvp: "going" },
      { id: "m2", displayName: "Sam", phone: null, role: "attendee", isCelebrant: false, rsvp: "maybe" },
      { id: "m3", displayName: "Nate", phone: null, role: "attendee", isCelebrant: false, rsvp: "pending" },
      { id: "m4", displayName: "Kevin", phone: null, role: "attendee", isCelebrant: false, rsvp: "declined" },
      // Redacted decline — the view nulled it for this (non-organizer) viewer.
      { id: "m5", displayName: "Quinn", phone: null, role: "attendee", isCelebrant: false, rsvp: null },
    ];

    it("renders a Maybe chip for maybe and an Invited chip for pending", () => {
      render(<RosterList members={rsvpMembers} tripName="Test Trip" />);
      expect(screen.getByText("Maybe")).toBeInTheDocument();
      expect(screen.getByText("Invited")).toBeInTheDocument();
    });

    it("renders nothing for going — the default row stays unmarked", () => {
      render(<RosterList members={rsvpMembers} tripName="Test Trip" />);
      const aliceRow = screen.getByText("Alice").closest("li");
      expect(aliceRow?.textContent).toBe("Alice");
    });

    it("renders the declined chip only when the status made it through the view", () => {
      render(<RosterList members={rsvpMembers} tripName="Test Trip" />);
      // Kevin's declined status was visible to this viewer → chip.
      expect(screen.getByText("Can't make it")).toBeInTheDocument();
      // Quinn's was redacted to null → row is unmarked, same as going.
      const quinnRow = screen.getByText("Quinn").closest("li");
      expect(quinnRow?.textContent).toBe("Quinn");
    });

    it("renders no chip when rsvp is not provided (callers that don't thread it)", () => {
      render(<RosterList members={sampleMembers} tripName="Test Trip" />);
      expect(screen.queryByText("Maybe")).not.toBeInTheDocument();
      expect(screen.queryByText("Invited")).not.toBeInTheDocument();
    });
  });

  // #386 — organizer-only member management affordance, per-row gating.
  describe("member-manage affordance gating (#386)", () => {
    const TRIP_ID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
    const crew: RosterMember[] = [
      // The viewer (an organizer) — never manageable.
      { id: "m1", displayName: "Dave", phone: null, role: "organizer", isCelebrant: false, isViewer: true },
      // The celebrant — never manageable.
      { id: "m2", displayName: "Mike", phone: null, role: "attendee", isCelebrant: true },
      // A co-organizer — manageable (demote / remove).
      { id: "m3", displayName: "Rob", phone: null, role: "co_organizer", isCelebrant: false },
      // A plain attendee — manageable.
      { id: "m4", displayName: "Kevin", phone: null, role: "attendee", isCelebrant: false },
    ];

    it("renders the affordance on every non-self, non-founder row for the FOUNDER (celebrant row = clear-mode)", () => {
      render(
        <RosterList
          members={crew}
          tripName="Test Trip"
          tripId={TRIP_ID}
          viewerRole="organizer"
        />
      );
      expect(screen.queryByTestId("manage-m1")).not.toBeInTheDocument();
      // The celebrant row now renders for the founder — clear-mode only.
      expect(screen.getByTestId("manage-m2")).toHaveAttribute(
        "data-celebrant",
        JSON.stringify({ isCelebrant: true, currentCelebrantName: null })
      );
      expect(screen.getByTestId("manage-m3")).toBeInTheDocument();
      expect(screen.getByTestId("manage-m4")).toBeInTheDocument();
      // Ordinary rows get the assign capability, naming the holder so
      // the reassign confirm can say who steps back.
      expect(screen.getByTestId("manage-m4")).toHaveAttribute(
        "data-celebrant",
        JSON.stringify({ isCelebrant: false, currentCelebrantName: "Mike" })
      );
    });

    it("threads NO celebrant capability to a co-organizer viewer (founder-only, rule 11)", () => {
      const coCrew: RosterMember[] = [
        { id: "m0", displayName: "Dave", phone: null, role: "organizer", isCelebrant: false },
        { id: "m2", displayName: "Mike", phone: null, role: "attendee", isCelebrant: true },
        { id: "m3", displayName: "Rob", phone: null, role: "co_organizer", isCelebrant: false, isViewer: true },
        { id: "m4", displayName: "Kevin", phone: null, role: "attendee", isCelebrant: false },
      ];
      render(
        <RosterList
          members={coCrew}
          tripName="Test Trip"
          tripId={TRIP_ID}
          viewerRole="co_organizer"
        />
      );
      // Celebrant row stays unmanageable for non-founders.
      expect(screen.queryByTestId("manage-m2")).not.toBeInTheDocument();
      // Ordinary rows keep role/remove but get no celebrant capability.
      expect(screen.getByTestId("manage-m4")).not.toHaveAttribute(
        "data-celebrant"
      );
    });

    it("never renders the founder's row as manageable, even for a co-organizer viewer", () => {
      const withFounder: RosterMember[] = [
        { id: "m0", displayName: "Dave", phone: null, role: "organizer", isCelebrant: false },
        { id: "m3", displayName: "Rob", phone: null, role: "co_organizer", isCelebrant: false, isViewer: true },
      ];
      render(
        <RosterList
          members={withFounder}
          tripName="Test Trip"
          tripId={TRIP_ID}
          viewerRole="co_organizer"
        />
      );
      expect(screen.queryByTestId("manage-m0")).not.toBeInTheDocument();
    });

    it("renders no affordance for a plain member viewer (roster unchanged)", () => {
      render(
        <RosterList
          members={crew}
          tripName="Test Trip"
          tripId={TRIP_ID}
          viewerRole="attendee"
        />
      );
      expect(screen.queryByTestId("manage-m3")).not.toBeInTheDocument();
      expect(screen.queryByTestId("manage-m4")).not.toBeInTheDocument();
    });

    it("renders no affordance when tripId is not threaded (defensive)", () => {
      render(
        <RosterList members={crew} tripName="Test Trip" viewerRole="organizer" />
      );
      expect(screen.queryByTestId("manage-m4")).not.toBeInTheDocument();
    });
  });
});
