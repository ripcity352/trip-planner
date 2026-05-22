/**
 * Unit tests for LodgingRoster — organizer assignment UI inside lodging card.
 * TDD: written before implementation.
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LodgingRoster } from "../lodging-roster";
import type { LodgingAssignment, TripMember } from "@/lib/db/types";

vi.mock("@/lib/actions/lodging-assignments", () => ({
  assignMemberToLodging: vi.fn(),
  removeLodgingAssignment: vi.fn(),
}));

import {
  assignMemberToLodging,
  removeLodgingAssignment,
} from "@/lib/actions/lodging-assignments";

const mockAssign = vi.mocked(assignMemberToLodging);
const mockRemove = vi.mocked(removeLodgingAssignment);

const makeAssignment = (overrides: Partial<LodgingAssignment> = {}): LodgingAssignment => ({
  id: "assign-1",
  item_id: "item-1",
  trip_member_id: "member-1",
  room_label: "Master bedroom",
  created_at: "2026-05-20T00:00:00Z",
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

describe("LodgingRoster", () => {
  const defaultProps = {
    itemId: "item-1",
    assignments: [makeAssignment()],
    tripMembers: [
      makeMember({ id: "member-1", display_name: "Dave" }),
      makeMember({ id: "member-2", display_name: "Alex", user_id: "user-2" }),
    ],
    isOrganizer: true,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    mockAssign.mockResolvedValue({
      ok: true,
      assignment: makeAssignment(),
    });
    mockRemove.mockResolvedValue({ ok: true });
  });

  it("renders the heading", () => {
    render(<LodgingRoster {...defaultProps} />);
    expect(screen.getByText(/who's in which room/i)).toBeInTheDocument();
  });

  it("renders existing assignments with member name and room label", () => {
    render(<LodgingRoster {...defaultProps} />);
    expect(screen.getByText("Dave")).toBeInTheDocument();
    // Room label appears inside a nested span — use partial text match
    expect(screen.getByText(/master bedroom/i)).toBeInTheDocument();
  });

  it("renders unassign button for organizer next to each assignment", () => {
    render(<LodgingRoster {...defaultProps} />);
    expect(
      screen.getByRole("button", { name: /unassign/i })
    ).toBeInTheDocument();
  });

  it("calls removeLodgingAssignment when unassign is clicked", async () => {
    render(<LodgingRoster {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: /unassign/i }));

    await waitFor(() => {
      expect(mockRemove).toHaveBeenCalledWith("assign-1");
    });
  });

  it("shows assign CTA for organizer", () => {
    render(<LodgingRoster {...defaultProps} />);
    expect(
      screen.getByRole("button", { name: /assign a room/i })
    ).toBeInTheDocument();
  });

  it("does not show assign CTA for non-organizer", () => {
    render(<LodgingRoster {...{ ...defaultProps, isOrganizer: false }} />);
    expect(
      screen.queryByRole("button", { name: /assign a room/i })
    ).not.toBeInTheDocument();
  });

  it("does not show unassign button for non-organizer", () => {
    render(<LodgingRoster {...{ ...defaultProps, isOrganizer: false }} />);
    expect(
      screen.queryByRole("button", { name: /unassign/i })
    ).not.toBeInTheDocument();
  });

  it("shows empty state when no assignments", () => {
    render(
      <LodgingRoster {...{ ...defaultProps, assignments: [] }} />
    );
    // No assignment rows for Dave — the name isn't in the list
    expect(screen.queryAllByText("Dave")).toHaveLength(0);
  });

  // #240 — dropdown must NEVER show a raw UUID. Display sites use
  // resolveMemberName ("Guest" terminal); the organizer-only assign dropdown
  // keeps the email-fallback tier so two unnamed members are disambiguable.
  it("shows email fallback in dropdown when member has no display_name (organizer-only disambiguation)", async () => {
    const members = [
      // member-1 is already assigned (in defaultProps.assignments)
      makeMember({ id: "member-1", display_name: "Dave" }),
      // member-2 has no display_name — dropdown must show email (NOT the UUID)
      makeMember({
        id: "member-2",
        display_name: null,
        email: "pete@example.com",
        user_id: "user-2",
      }),
    ];

    render(
      <LodgingRoster
        itemId="item-1"
        assignments={[makeAssignment({ trip_member_id: "member-1" })]}
        tripMembers={members}
        isOrganizer={true}
      />
    );

    // Open the assign form
    fireEvent.click(screen.getByRole("button", { name: /assign a room/i }));

    // The select shows the email so the organizer can disambiguate
    const option = screen.getByRole("option", { name: "pete@example.com" });
    expect(option).toBeInTheDocument();
    // UUID must never appear
    expect(screen.queryByRole("option", { name: "member-2" })).not.toBeInTheDocument();
  });

  it("shows 'Guest' in dropdown when both display_name and email are null — never the UUID", async () => {
    const members = [
      makeMember({ id: "member-1", display_name: "Dave" }),
      makeMember({
        id: "member-2",
        display_name: null,
        email: null,
        user_id: "user-2",
      }),
    ];

    render(
      <LodgingRoster
        itemId="item-1"
        assignments={[makeAssignment({ trip_member_id: "member-1" })]}
        tripMembers={members}
        isOrganizer={true}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /assign a room/i }));

    // resolveMemberName fallback — "Guest" not "member-2"
    const option = screen.getByRole("option", { name: "Guest" });
    expect(option).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "member-2" })).not.toBeInTheDocument();
  });
});
