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
});
