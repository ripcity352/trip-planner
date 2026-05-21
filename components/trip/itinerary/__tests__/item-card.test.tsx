/**
 * Unit tests for ItemCard — Server Component (rendered as static for tests).
 * TDD: written before implementation.
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ItemCard } from "../item-card";
import type {
  ItineraryItem,
  ItineraryItemRsvpStatus,
  LodgingAssignment,
  TripMember,
} from "@/lib/db/types";

// Mock sub-components
vi.mock("../maps-link", () => ({
  MapsLink: ({ address }: { address: string }) => (
    <a href={`https://maps.apple.com/?q=${address}`}>{address}</a>
  ),
}));
vi.mock("../item-rsvp-chip", () => ({
  ItemRsvpChip: ({
    itemId,
    initialStatus,
  }: {
    itemId: string;
    initialStatus: ItineraryItemRsvpStatus | null;
  }) => (
    <div data-testid="rsvp-chip" data-item-id={itemId} data-status={initialStatus}>
      rsvp
    </div>
  ),
}));
vi.mock("../item-flag-form", () => ({
  ItemFlagForm: ({ itemId }: { itemId: string }) => (
    <div data-testid="flag-form" data-item-id={itemId}>
      flags
    </div>
  ),
}));
vi.mock("../edit-item-form-sheet", () => ({
  EditItemFormSheet: ({ item }: { item: ItineraryItem }) => (
    <button data-testid="edit-item-sheet" data-item-id={item.id}>
      Edit
    </button>
  ),
}));
vi.mock("../lodging-roster", () => ({
  LodgingRoster: ({
    itemId,
    assignments,
  }: {
    itemId: string;
    assignments: LodgingAssignment[];
  }) => (
    <div
      data-testid="lodging-roster"
      data-item-id={itemId}
      data-assignment-count={assignments.length}
    >
      roster
    </div>
  ),
}));

const makeItem = (overrides: Partial<ItineraryItem> = {}): ItineraryItem => ({
  id: "item-1",
  trip_id: "trip-1",
  title: "Dinner at the Wynn",
  kind: "meal",
  day: "2026-08-01",
  start_time: "19:00",
  end_time: "21:00",
  location: null,
  address: "3131 Las Vegas Blvd S, Las Vegas, NV 89109",
  notes: null,
  cost_cents: null,
  currency: "USD",
  created_by: "user-1",
  created_at: "2026-05-20T00:00:00Z",
  updated_at: "2026-05-20T00:00:00Z",
  visibility: "everyone",
  activity_tag: ["fancy"],
  dress_code: "Smart casual",
  idempotency_key: null,
  ...overrides,
});

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

const baseProps = {
  myRsvpStatus: null as ItineraryItemRsvpStatus | null,
  isOrganizer: false,
  isCelebrant: false,
  lodgingAssignments: [] as LodgingAssignment[],
  tripMembers: [] as TripMember[],
  // W2b: tripTimezone required by EditItemFormSheet
  tripTimezone: "America/New_York",
};

describe("ItemCard", () => {
  it("renders the item title", () => {
    render(<ItemCard item={makeItem()} {...baseProps} />);
    expect(screen.getByText("Dinner at the Wynn")).toBeInTheDocument();
  });

  it("renders a MapsLink when address is present", () => {
    render(<ItemCard item={makeItem()} {...baseProps} />);
    expect(screen.getByText("3131 Las Vegas Blvd S, Las Vegas, NV 89109")).toBeInTheDocument();
  });

  it("does not render MapsLink when address is null", () => {
    render(<ItemCard item={makeItem({ address: null })} {...baseProps} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders dress code when present", () => {
    render(<ItemCard item={makeItem()} {...baseProps} />);
    expect(screen.getByText(/smart casual/i)).toBeInTheDocument();
  });

  it("renders activity tag chips", () => {
    render(
      <ItemCard item={makeItem({ activity_tag: ["fancy", "foodie"] })} {...baseProps} />
    );
    expect(screen.getByText("fancy")).toBeInTheDocument();
    expect(screen.getByText("foodie")).toBeInTheDocument();
  });

  it("shows 'Something planned' placeholder for celebrant on hide_from_celebrant item", () => {
    render(
      <ItemCard
        item={makeItem({ visibility: "hide_from_celebrant" })}
        {...baseProps}
        isCelebrant={true}
      />
    );
    expect(screen.getByText("Something planned")).toBeInTheDocument();
    expect(screen.queryByText("Dinner at the Wynn")).not.toBeInTheDocument();
  });

  it("shows the full title for organizer on hide_from_celebrant item", () => {
    render(
      <ItemCard
        item={makeItem({ visibility: "hide_from_celebrant" })}
        {...baseProps}
        isOrganizer={true}
      />
    );
    expect(screen.getByText("Dinner at the Wynn")).toBeInTheDocument();
  });

  it("shows visibility badge for organizer when hide_from_celebrant", () => {
    render(
      <ItemCard
        item={makeItem({ visibility: "hide_from_celebrant" })}
        {...baseProps}
        isOrganizer={true}
      />
    );
    expect(screen.getByText(/hidden from/i)).toBeInTheDocument();
  });

  it("renders ItemRsvpChip with correct initial status", () => {
    render(
      <ItemCard item={makeItem()} {...baseProps} myRsvpStatus="skipping" />
    );
    const chip = screen.getByTestId("rsvp-chip");
    expect(chip).toHaveAttribute("data-status", "skipping");
    expect(chip).toHaveAttribute("data-item-id", "item-1");
  });

  it("renders ItemFlagForm for non-organizer members", () => {
    render(<ItemCard item={makeItem()} {...baseProps} />);
    expect(screen.getByTestId("flag-form")).toBeInTheDocument();
  });

  // CRITICAL fix #1: Edit affordance for organizers
  it("renders Edit affordance (EditItemFormSheet) when isOrganizer=true", () => {
    render(
      <ItemCard item={makeItem()} {...baseProps} isOrganizer={true} />
    );
    expect(screen.getByTestId("edit-item-sheet")).toBeInTheDocument();
    expect(screen.getByTestId("edit-item-sheet")).toHaveAttribute(
      "data-item-id",
      "item-1"
    );
  });

  it("does not render EditItemFormSheet when isOrganizer=false", () => {
    render(<ItemCard item={makeItem()} {...baseProps} isOrganizer={false} />);
    expect(screen.queryByTestId("edit-item-sheet")).not.toBeInTheDocument();
  });

  // CRITICAL fix #2: LodgingRoster only for lodging items
  it("renders LodgingRoster only when item.kind is 'lodging'", () => {
    const assignments = [makeAssignment()];
    const members = [makeMember()];
    render(
      <ItemCard
        item={makeItem({ kind: "lodging" })}
        {...baseProps}
        lodgingAssignments={assignments}
        tripMembers={members}
      />
    );
    const roster = screen.getByTestId("lodging-roster");
    expect(roster).toBeInTheDocument();
    expect(roster).toHaveAttribute("data-item-id", "item-1");
    expect(roster).toHaveAttribute("data-assignment-count", "1");
  });

  it("does not render LodgingRoster for non-lodging items", () => {
    render(
      <ItemCard
        item={makeItem({ kind: "meal" })}
        {...baseProps}
        lodgingAssignments={[makeAssignment()]}
        tripMembers={[makeMember()]}
      />
    );
    expect(screen.queryByTestId("lodging-roster")).not.toBeInTheDocument();
  });

  it("renders LodgingRoster with empty assignments when no one is assigned", () => {
    render(
      <ItemCard
        item={makeItem({ kind: "lodging" })}
        {...baseProps}
        lodgingAssignments={[]}
        tripMembers={[makeMember()]}
      />
    );
    const roster = screen.getByTestId("lodging-roster");
    expect(roster).toBeInTheDocument();
    expect(roster).toHaveAttribute("data-assignment-count", "0");
  });
});
