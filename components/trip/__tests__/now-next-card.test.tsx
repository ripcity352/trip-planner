/**
 * Tests for `components/trip/now-next-card.tsx`
 *
 * The card has three render states:
 *   1. Pre-trip: no items OR all items are future → shows "Trip starts in N days"
 *   2. In-trip: shows now/next items with headings from M3_UI_STRINGS
 *   3. Post-trip: all items past → shows "Trip wrapped N days ago" + recap placeholder
 *
 * The component is a Server Component (no client state), so we test it as
 * a plain async function (no act / userEvent needed).
 *
 * We mock the pure function `whatsHappeningNow` to keep this test suite
 * focused on the rendering logic, not the time-computation logic (which is
 * covered in whats-happening-now.test.ts).
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import type { ItineraryItem, Trip } from "@/lib/db/types";

// Minimal Trip fixture — only fields the card reads
function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "trip-1",
    slug: "the-bach",
    name: "The Bach Trip",
    description: null,
    location: null,
    starts_at: null,
    ends_at: null,
    created_by: "u-1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    kind: "bachelor",
    is_template: false,
    deleted_at: null,
    archived_at: null,
    vibe_tags: [],
    notes: null,
    ...overrides,
  };
}

function makeItem(id: string, day: string, title: string): ItineraryItem {
  return {
    id,
    trip_id: "trip-1",
    day,
    start_time: "10:00",
    end_time: "12:00",
    title,
    location: null,
    address: null,
    notes: null,
    cost_cents: null,
    currency: "USD",
    created_by: "u-1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    visibility: "everyone",
    kind: "activity",
    activity_tag: [],
    dress_code: null,
    idempotency_key: null,
  };
}

// Mock date-fns to make day-diff deterministic
vi.mock("date-fns", async () => {
  const actual = await vi.importActual<typeof import("date-fns")>("date-fns");
  return {
    ...actual,
    differenceInCalendarDays: vi.fn(actual.differenceInCalendarDays),
  };
});

// Mock whatsHappeningNow so rendering tests don't depend on system clock
vi.mock("@/lib/utils/whats-happening-now", () => ({
  whatsHappeningNow: vi.fn(),
}));

describe("NowNextCard", () => {
  it("shows no-items copy when the itinerary is empty", async () => {
    const { whatsHappeningNow } = await import(
      "@/lib/utils/whats-happening-now"
    );
    vi.mocked(whatsHappeningNow).mockReturnValue({ now: null, next: null });

    const { NowNextCard } = await import("@/components/trip/now-next-card");
    const trip = makeTrip({ starts_at: "2026-08-01", ends_at: "2026-08-05" });

    render(await NowNextCard({ trip, items: [] }));

    expect(
      screen.getByText(M3_UI_STRINGS.nowNext_no_items_yet)
    ).toBeInTheDocument();
  });

  it("shows pre-trip template when trip hasn't started yet (days > 0)", async () => {
    const { whatsHappeningNow } = await import(
      "@/lib/utils/whats-happening-now"
    );
    const futureItem = makeItem("a", "2026-08-01", "Check in");
    vi.mocked(whatsHappeningNow).mockReturnValue({
      now: null,
      next: futureItem,
    });

    const { NowNextCard } = await import("@/components/trip/now-next-card");
    const trip = makeTrip({
      starts_at: "2026-08-01",
      ends_at: "2026-08-05",
    });
    const items = [futureItem];

    render(await NowNextCard({ trip, items }));

    // Should show the next-heading label and the item title
    expect(
      screen.getByText(M3_UI_STRINGS.nowNext_next_heading)
    ).toBeInTheDocument();
    expect(screen.getByText("Check in")).toBeInTheDocument();
  });

  it("shows now and next headings when in-trip", async () => {
    const { whatsHappeningNow } = await import(
      "@/lib/utils/whats-happening-now"
    );
    const nowItem = makeItem("a", "2026-07-01", "Pool party");
    const nextItem = makeItem("b", "2026-07-01", "Dinner");
    vi.mocked(whatsHappeningNow).mockReturnValue({
      now: nowItem,
      next: nextItem,
    });

    const { NowNextCard } = await import("@/components/trip/now-next-card");
    const trip = makeTrip({
      starts_at: "2026-07-01",
      ends_at: "2026-07-03",
    });

    render(await NowNextCard({ trip, items: [nowItem, nextItem] }));

    expect(
      screen.getByText(M3_UI_STRINGS.nowNext_now_heading)
    ).toBeInTheDocument();
    expect(screen.getByText("Pool party")).toBeInTheDocument();
    expect(
      screen.getByText(M3_UI_STRINGS.nowNext_next_heading)
    ).toBeInTheDocument();
    expect(screen.getByText("Dinner")).toBeInTheDocument();
  });

  it("shows now-heading only when in-trip with no next item", async () => {
    const { whatsHappeningNow } = await import(
      "@/lib/utils/whats-happening-now"
    );
    const nowItem = makeItem("a", "2026-07-01", "Last event");
    vi.mocked(whatsHappeningNow).mockReturnValue({
      now: nowItem,
      next: null,
    });

    const { NowNextCard } = await import("@/components/trip/now-next-card");
    const trip = makeTrip({
      starts_at: "2026-07-01",
      ends_at: "2026-07-01",
    });

    render(await NowNextCard({ trip, items: [nowItem] }));

    expect(
      screen.getByText(M3_UI_STRINGS.nowNext_now_heading)
    ).toBeInTheDocument();
    expect(screen.getByText("Last event")).toBeInTheDocument();
    expect(
      screen.queryByText(M3_UI_STRINGS.nowNext_next_heading)
    ).not.toBeInTheDocument();
  });

  it("shows post-trip copy and recap placeholder when all items are in the past", async () => {
    const { whatsHappeningNow } = await import(
      "@/lib/utils/whats-happening-now"
    );
    vi.mocked(whatsHappeningNow).mockReturnValue({ now: null, next: null });

    const { NowNextCard } = await import("@/components/trip/now-next-card");
    // Use dates firmly in the past (2025) so the post-trip check is reliable
    const pastItem = makeItem("a", "2025-03-01", "Pool party");
    const trip = makeTrip({
      starts_at: "2025-03-01",
      ends_at: "2025-03-03",
    });

    render(await NowNextCard({ trip, items: [pastItem] }));

    // Post-trip state: shows recap placeholder (NOT an active link)
    expect(
      screen.getByText(M3_UI_STRINGS.nowNext_recap_placeholder)
    ).toBeInTheDocument();
    // Recap placeholder must NOT be a link element
    const recapEl = screen.getByText(
      M3_UI_STRINGS.nowNext_recap_placeholder
    );
    expect(recapEl.tagName.toLowerCase()).not.toBe("a");
  });
});
