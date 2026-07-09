/**
 * Unit tests for AnnouncementList — realtime-subscribing list component.
 * TDD: written before implementation (RED phase).
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { AnnouncementList } from "../announcement-list";
import type { Announcement } from "@/lib/db/types";

// Mock the browser Supabase client
const mockRemoveChannel = vi.fn();
const mockChannel = { unsubscribe: vi.fn() };

vi.mock("@/lib/supabase/browser", () => ({
  createClient: vi.fn(() => ({
    removeChannel: mockRemoveChannel,
  })),
}));

// Mock subscribeToAnnouncements so we can control the callback.
// W1c: signature now includes memberUserMap as 4th arg.
let capturedOnInsert: ((a: Announcement) => void) | null = null;

vi.mock("@/lib/db/announcements", () => ({
  subscribeToAnnouncements: vi.fn((_supabase, _tripId, onInsert, _memberUserMap) => {
    capturedOnInsert = onInsert;
    return mockChannel;
  }),
}));

// #349: the list must authenticate the realtime connection before
// subscribing — mock the helper so the ordering is observable.
vi.mock("@/lib/supabase/realtime-auth", () => ({
  ensureRealtimeAuth: vi.fn(async () => {}),
}));

import { subscribeToAnnouncements } from "@/lib/db/announcements";
import { createClient } from "@/lib/supabase/browser";
import { ensureRealtimeAuth } from "@/lib/supabase/realtime-auth";

/**
 * The subscription is gated behind `await ensureRealtimeAuth(...)` (#349),
 * so it lands a microtask after mount. Flush it before asserting on
 * anything subscription-dependent.
 */
async function flushSubscription() {
  await act(async () => {});
}

/** Empty map satisfies the required memberUserMap prop in most tests. */
const EMPTY_MAP = new Map<string, string | null>();

const makeAnnouncement = (
  overrides: Partial<Announcement> = {}
): Announcement => ({
  id: `ann-${Math.random()}`,
  trip_id: "trip-1",
  author_id: "user-1",
  body: "Test announcement.",
  pinned: false,
  created_at: "2026-05-20T10:00:00Z",
  idempotency_key: null,
  visibility: "everyone",
  created_by: "user-1",
  ...overrides,
});

describe("AnnouncementList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnInsert = null;
  });

  it("renders the empty-state when no announcements", () => {
    render(<AnnouncementList tripId="trip-1" initialAnnouncements={[]} memberUserMap={EMPTY_MAP} />);
    // EMPTY_STATES.announcements = "All quiet. No news is probably good news."
    expect(screen.getByText(/all quiet/i)).toBeInTheDocument();
  });

  it("renders all initial announcements", () => {
    const items = [
      makeAnnouncement({ id: "ann-1", body: "First update." }),
      makeAnnouncement({ id: "ann-2", body: "Second update." }),
    ];
    render(<AnnouncementList tripId="trip-1" initialAnnouncements={items} memberUserMap={EMPTY_MAP} />);
    expect(screen.getByText("First update.")).toBeInTheDocument();
    expect(screen.getByText("Second update.")).toBeInTheDocument();
  });

  it("renders pinned announcements before non-pinned", () => {
    const items = [
      makeAnnouncement({ id: "ann-1", body: "Regular update.", pinned: false }),
      makeAnnouncement({ id: "ann-2", body: "Pinned update.", pinned: true }),
    ];
    render(<AnnouncementList tripId="trip-1" initialAnnouncements={items} memberUserMap={EMPTY_MAP} />);

    const cards = screen.getAllByText(/update\./);
    // Pinned should come first in the DOM
    expect(cards[0].textContent).toContain("Pinned update.");
    expect(cards[1].textContent).toContain("Regular update.");
  });

  it("calls subscribeToAnnouncements on mount with the correct tripId", async () => {
    render(<AnnouncementList tripId="trip-42" initialAnnouncements={[]} memberUserMap={EMPTY_MAP} />);
    await flushSubscription();
    // W1c: subscribeToAnnouncements now takes 4 args (supabase, tripId, onInsert, memberUserMap)
    expect(subscribeToAnnouncements).toHaveBeenCalledWith(
      expect.anything(),
      "trip-42",
      expect.any(Function),
      EMPTY_MAP
    );
  });

  it("authenticates the realtime connection before subscribing (#349)", async () => {
    // On a fresh page load supabase-js never pushes the session token to
    // the realtime connection (INITIAL_SESSION is skipped by
    // _handleTokenChanged), so an eager subscribe joins with anon claims
    // and RLS silently filters every postgres_changes frame. The list
    // must await ensureRealtimeAuth BEFORE opening the channel.
    render(<AnnouncementList tripId="trip-1" initialAnnouncements={[]} memberUserMap={EMPTY_MAP} />);
    await flushSubscription();
    expect(ensureRealtimeAuth).toHaveBeenCalledTimes(1);
    const authOrder =
      vi.mocked(ensureRealtimeAuth).mock.invocationCallOrder[0];
    const subscribeOrder =
      vi.mocked(subscribeToAnnouncements).mock.invocationCallOrder[0];
    expect(authOrder).toBeLessThan(subscribeOrder);
  });

  it("adds a new announcement to the list when the realtime callback fires", async () => {
    render(<AnnouncementList tripId="trip-1" initialAnnouncements={[]} memberUserMap={EMPTY_MAP} />);
    await flushSubscription();

    const newItem = makeAnnouncement({ id: "ann-realtime", body: "Live update!" });
    act(() => {
      capturedOnInsert?.(newItem);
    });

    expect(screen.getByText("Live update!")).toBeInTheDocument();
  });

  it("prepends new realtime announcements before existing ones", async () => {
    const existing = makeAnnouncement({ id: "ann-existing", body: "Existing." });
    render(
      <AnnouncementList tripId="trip-1" initialAnnouncements={[existing]} memberUserMap={EMPTY_MAP} />
    );
    await flushSubscription();

    const incoming = makeAnnouncement({ id: "ann-new", body: "New one!" });
    act(() => {
      capturedOnInsert?.(incoming);
    });

    const bodies = screen
      .getAllByText(/\.$/)
      .map((el) => el.textContent ?? "");

    // New one should appear before existing
    const newIdx = bodies.findIndex((t) => t === "New one!");
    const existIdx = bodies.findIndex((t) => t === "Existing.");
    expect(newIdx).toBeLessThan(existIdx);
  });

  it("calls removeChannel on unmount to clean up the subscription", async () => {
    const { unmount } = render(
      <AnnouncementList tripId="trip-1" initialAnnouncements={[]} memberUserMap={EMPTY_MAP} />
    );
    await flushSubscription();
    unmount();
    const supabase = vi.mocked(createClient)();
    expect(supabase.removeChannel).toHaveBeenCalledWith(mockChannel);
  });

  it("does not render the empty state when there are announcements", () => {
    const items = [makeAnnouncement({ body: "Something happened." })];
    render(<AnnouncementList tripId="trip-1" initialAnnouncements={items} memberUserMap={EMPTY_MAP} />);
    expect(screen.queryByText(/all quiet/i)).not.toBeInTheDocument();
  });

  it("places a pinned realtime arrival above an existing non-pinned item", async () => {
    const existing = makeAnnouncement({
      id: "ann-existing",
      body: "Regular update.",
      pinned: false,
      created_at: "2026-05-20T09:00:00Z",
    });
    render(
      <AnnouncementList tripId="trip-1" initialAnnouncements={[existing]} memberUserMap={EMPTY_MAP} />
    );
    await flushSubscription();

    const pinnedIncoming = makeAnnouncement({
      id: "ann-pinned",
      body: "Pinned later but should float to top.",
      pinned: true,
      created_at: "2026-05-20T10:00:00Z",
    });
    act(() => {
      capturedOnInsert?.(pinnedIncoming);
    });

    const bodies = screen.getAllByText(/\.$/).map((el) => el.textContent ?? "");
    const pinnedIdx = bodies.findIndex(
      (t) => t === "Pinned later but should float to top."
    );
    const regularIdx = bodies.findIndex((t) => t === "Regular update.");
    expect(pinnedIdx).toBeLessThan(regularIdx);
  });

  it("renders the feed with aria-live='polite' for screen-reader updates", () => {
    const items = [makeAnnouncement({ body: "Visible announcement." })];
    render(<AnnouncementList tripId="trip-1" initialAnnouncements={items} memberUserMap={EMPTY_MAP} />);
    const list = screen.getByRole("list");
    expect(list).toHaveAttribute("aria-live", "polite");
  });
});
