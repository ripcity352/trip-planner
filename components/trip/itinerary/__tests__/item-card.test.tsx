/**
 * Unit tests for ItemCard — Server Component (rendered as static for tests).
 * TDD: written before implementation.
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ItemCard } from "../item-card";
import type { ItineraryItem, ItineraryItemRsvpStatus } from "@/lib/db/types";

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

describe("ItemCard", () => {
  it("renders the item title", () => {
    render(
      <ItemCard
        item={makeItem()}
        myRsvpStatus={null}
        isOrganizer={false}
        isCelebrant={false}
      />
    );
    expect(screen.getByText("Dinner at the Wynn")).toBeInTheDocument();
  });

  it("renders a MapsLink when address is present", () => {
    render(
      <ItemCard
        item={makeItem()}
        myRsvpStatus={null}
        isOrganizer={false}
        isCelebrant={false}
      />
    );
    expect(screen.getByText("3131 Las Vegas Blvd S, Las Vegas, NV 89109")).toBeInTheDocument();
  });

  it("does not render MapsLink when address is null", () => {
    render(
      <ItemCard
        item={makeItem({ address: null })}
        myRsvpStatus={null}
        isOrganizer={false}
        isCelebrant={false}
      />
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders dress code when present", () => {
    render(
      <ItemCard
        item={makeItem()}
        myRsvpStatus={null}
        isOrganizer={false}
        isCelebrant={false}
      />
    );
    expect(screen.getByText(/smart casual/i)).toBeInTheDocument();
  });

  it("renders activity tag chips", () => {
    render(
      <ItemCard
        item={makeItem({ activity_tag: ["fancy", "foodie"] })}
        myRsvpStatus={null}
        isOrganizer={false}
        isCelebrant={false}
      />
    );
    expect(screen.getByText("fancy")).toBeInTheDocument();
    expect(screen.getByText("foodie")).toBeInTheDocument();
  });

  it("shows 'Something planned' placeholder for celebrant on hide_from_celebrant item", () => {
    render(
      <ItemCard
        item={makeItem({ visibility: "hide_from_celebrant" })}
        myRsvpStatus={null}
        isOrganizer={false}
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
        myRsvpStatus={null}
        isOrganizer={true}
        isCelebrant={false}
      />
    );
    expect(screen.getByText("Dinner at the Wynn")).toBeInTheDocument();
  });

  it("shows visibility badge for organizer when hide_from_celebrant", () => {
    render(
      <ItemCard
        item={makeItem({ visibility: "hide_from_celebrant" })}
        myRsvpStatus={null}
        isOrganizer={true}
        isCelebrant={false}
      />
    );
    // Should show some badge indicating this item is hidden from celebrant
    expect(screen.getByText(/hidden from/i)).toBeInTheDocument();
  });

  it("renders ItemRsvpChip with correct initial status", () => {
    render(
      <ItemCard
        item={makeItem()}
        myRsvpStatus="skipping"
        isOrganizer={false}
        isCelebrant={false}
      />
    );
    const chip = screen.getByTestId("rsvp-chip");
    expect(chip).toHaveAttribute("data-status", "skipping");
    expect(chip).toHaveAttribute("data-item-id", "item-1");
  });

  it("renders ItemFlagForm for non-organizer members", () => {
    render(
      <ItemCard
        item={makeItem()}
        myRsvpStatus={null}
        isOrganizer={false}
        isCelebrant={false}
      />
    );
    expect(screen.getByTestId("flag-form")).toBeInTheDocument();
  });
});
