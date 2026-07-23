/**
 * Unit tests for DaySection — Server Component (rendered as static for tests).
 * TDD: written before implementation.
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DaySection } from "../day-section";
import type { ItineraryItem } from "@/lib/db/types";

// Mock ItemCard since we're testing DaySection in isolation. Surface the
// now/next flags as data attributes so the threading can be asserted.
vi.mock("../item-card", () => ({
  ItemCard: ({
    item,
    isNow,
    isNext,
  }: {
    item: ItineraryItem;
    isNow?: boolean;
    isNext?: boolean;
  }) => (
    <div
      data-testid="item-card"
      data-item-id={item.id}
      data-is-now={isNow ? "true" : "false"}
      data-is-next={isNext ? "true" : "false"}
    >
      {item.title}
    </div>
  ),
}));

const makeItem = (
  overrides: Partial<ItineraryItem> = {}
): ItineraryItem => ({
  id: "item-1",
  trip_id: "trip-1",
  title: "Pool time",
  kind: "activity",
  day: "2026-08-01",
  start_time: "14:00",
  end_time: "17:00",
  end_day: null,
  location: null,
  address: null,
  notes: null,
  cost_cents: null,
  currency: "USD",
  created_by: "user-1",
  created_at: "2026-05-20T00:00:00Z",
  updated_at: "2026-05-20T00:00:00Z",
  visibility: "everyone",
  activity_tag: [],
  dress_code: null,
  idempotency_key: null,
  ...overrides,
});

const sharedProps = {
  myRsvpMap: {},
  isOrganizer: false,
  isCelebrant: false,
  lodgingAssignmentsMap: new Map(),
  itemFlagsMap: new Map(),
  tripMembers: [],
  // W2b: tripTimezone required by DaySection → ItemCard → EditItemFormSheet
  tripTimezone: "America/New_York",
  // #394: trip-level "going" RSVP count, forwarded to every ItemCard
  inCount: 0,
  // #508: multi-day items passing through this day (default: none)
  continuingItems: [] as ItineraryItem[],
  // #484: now/next cue ids (default: nothing flagged)
  nowItemId: null as string | null,
  nextItemId: null as string | null,
};

describe("DaySection", () => {
  it("renders the day heading with weekday and formatted date", () => {
    render(
      <DaySection
        day="2026-08-01"
        items={[makeItem()]}
        {...sharedProps}
      />
    );
    // Saturday · Aug 1 format
    expect(screen.getByText(/saturday/i)).toBeInTheDocument();
    expect(screen.getByText(/aug 1/i)).toBeInTheDocument();
  });

  it("renders an ItemCard for each item", () => {
    render(
      <DaySection
        day="2026-08-01"
        items={[
          makeItem({ id: "i1", title: "Lunch" }),
          makeItem({ id: "i2", title: "Dinner" }),
        ]}
        {...sharedProps}
      />
    );
    const cards = screen.getAllByTestId("item-card");
    expect(cards).toHaveLength(2);
    expect(screen.getByText("Lunch")).toBeInTheDocument();
    expect(screen.getByText("Dinner")).toBeInTheDocument();
  });

  it("renders nothing when items array is empty", () => {
    const { container } = render(
      <DaySection
        day="2026-08-01"
        items={[]}
        {...sharedProps}
      />
    );
    // No item cards
    expect(container.querySelectorAll("[data-testid='item-card']")).toHaveLength(0);
  });
});

describe("DaySection — celebrant gap-day note (#480)", () => {
  const gapItems = [
    makeItem({ id: "g1", title: "Secret dinner", visibility: "hide_from_celebrant" }),
    makeItem({ id: "g2", title: "Planning huddle", visibility: "organizers_only" }),
  ];

  it("shows the note to an organizer who is not the celebrant on an all-hidden day", () => {
    render(
      <DaySection
        day="2026-08-01"
        items={gapItems}
        {...sharedProps}
        isOrganizer
        isCelebrant={false}
        celebrantName="Mike"
      />
    );
    const note = screen.getByTestId("celebrant-gap-note");
    expect(note).toBeInTheDocument();
    expect(note).toHaveTextContent(/wide open to Mike/i);
  });

  it("falls back to the generic celebrant noun when no name is threaded", () => {
    render(
      <DaySection
        day="2026-08-01"
        items={gapItems}
        {...sharedProps}
        isOrganizer
        isCelebrant={false}
      />
    );
    expect(screen.getByTestId("celebrant-gap-note")).toHaveTextContent(
      /wide open to the celebrant/i
    );
  });

  // LOAD-BEARING (2026-05-20 decoy-item ADR): a celebrant who is ALSO an
  // organizer must never see the note — it would leak the existence of
  // hidden content to the exact person the visibility filter protects.
  it("never shows the note to a celebrant, even one who is also an organizer", () => {
    render(
      <DaySection
        day="2026-08-01"
        items={gapItems}
        {...sharedProps}
        isOrganizer
        isCelebrant
        celebrantName="Mike"
      />
    );
    expect(screen.queryByTestId("celebrant-gap-note")).not.toBeInTheDocument();
  });

  it("does not show the note to a plain member", () => {
    render(
      <DaySection
        day="2026-08-01"
        items={gapItems}
        {...sharedProps}
        isOrganizer={false}
        isCelebrant={false}
      />
    );
    expect(screen.queryByTestId("celebrant-gap-note")).not.toBeInTheDocument();
  });

  it("does not show the note on a day with at least one celebrant-visible item", () => {
    render(
      <DaySection
        day="2026-08-01"
        items={[...gapItems, makeItem({ id: "v1", visibility: "everyone" })]}
        {...sharedProps}
        isOrganizer
        isCelebrant={false}
        celebrantName="Mike"
      />
    );
    expect(screen.queryByTestId("celebrant-gap-note")).not.toBeInTheDocument();
  });
});

describe("DaySection — multi-day continues marker (#508)", () => {
  it("renders a continues line with title + through-date for a passing item", () => {
    render(
      <DaySection
        day="2026-08-02"
        items={[makeItem({ id: "own", title: "Breakfast" })]}
        {...sharedProps}
        continuingItems={[
          makeItem({
            id: "villa",
            title: "Beach villa",
            day: "2026-08-01",
            end_day: "2026-08-04",
          }),
        ]}
      />
    );
    const marker = screen.getByTestId("continues-marker");
    expect(marker).toHaveTextContent(/beach villa continues/i);
    expect(marker).toHaveTextContent(/through Aug 4/i);
  });

  it("renders one marker per continuing item", () => {
    render(
      <DaySection
        day="2026-08-02"
        items={[makeItem({ id: "own" })]}
        {...sharedProps}
        continuingItems={[
          makeItem({ id: "a", title: "Villa", day: "2026-08-01", end_day: "2026-08-04" }),
          makeItem({ id: "b", title: "Festival pass", day: "2026-08-01", end_day: "2026-08-03" }),
        ]}
      />
    );
    expect(screen.getAllByTestId("continues-marker")).toHaveLength(2);
  });

  it("renders no marker when nothing continues through the day", () => {
    render(
      <DaySection
        day="2026-08-01"
        items={[makeItem()]}
        {...sharedProps}
        continuingItems={[]}
      />
    );
    expect(screen.queryByTestId("continues-marker")).not.toBeInTheDocument();
  });
});

describe("DaySection — now/next cue threading (#484)", () => {
  it("flags the matching card as now / next and leaves others unflagged", () => {
    render(
      <DaySection
        day="2026-08-01"
        items={[
          makeItem({ id: "i1", title: "Now item" }),
          makeItem({ id: "i2", title: "Next item" }),
          makeItem({ id: "i3", title: "Later item" }),
        ]}
        {...sharedProps}
        nowItemId="i1"
        nextItemId="i2"
      />
    );
    const [now, next, later] = screen.getAllByTestId("item-card");
    expect(now).toHaveAttribute("data-is-now", "true");
    expect(now).toHaveAttribute("data-is-next", "false");
    expect(next).toHaveAttribute("data-is-next", "true");
    expect(next).toHaveAttribute("data-is-now", "false");
    expect(later).toHaveAttribute("data-is-now", "false");
    expect(later).toHaveAttribute("data-is-next", "false");
  });

  it("flags nothing when both ids are null", () => {
    render(
      <DaySection
        day="2026-08-01"
        items={[makeItem({ id: "i1" })]}
        {...sharedProps}
        nowItemId={null}
        nextItemId={null}
      />
    );
    const [card] = screen.getAllByTestId("item-card");
    expect(card).toHaveAttribute("data-is-now", "false");
    expect(card).toHaveAttribute("data-is-next", "false");
  });
});
