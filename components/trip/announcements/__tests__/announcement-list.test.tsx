/**
 * Unit tests for AnnouncementList — realtime-subscribing list component.
 * TDD: written before implementation (RED phase).
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
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

// #393 — organizer delete/pin server actions, mocked so the overflow-menu
// tests below control success/failure without a real network call.
const deleteAnnouncementActionMock = vi.fn();
const pinAnnouncementActionMock = vi.fn();
vi.mock("@/lib/actions/announcements", () => ({
  deleteAnnouncementAction: (...args: unknown[]) =>
    deleteAnnouncementActionMock(...args),
  pinAnnouncementAction: (...args: unknown[]) =>
    pinAnnouncementActionMock(...args),
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
    render(<AnnouncementList tripId="trip-1" isOrganizer={false} initialAnnouncements={[]} memberUserMap={EMPTY_MAP} />);
    // EMPTY_STATES.announcements = "All quiet. No news is probably good news."
    expect(screen.getByText(/all quiet/i)).toBeInTheDocument();
  });

  it("renders all initial announcements", () => {
    const items = [
      makeAnnouncement({ id: "ann-1", body: "First update." }),
      makeAnnouncement({ id: "ann-2", body: "Second update." }),
    ];
    render(<AnnouncementList tripId="trip-1" isOrganizer={false} initialAnnouncements={items} memberUserMap={EMPTY_MAP} />);
    expect(screen.getByText("First update.")).toBeInTheDocument();
    expect(screen.getByText("Second update.")).toBeInTheDocument();
  });

  it("#470: collapses a pinned announcement into the one-line banner, not a full card in the feed", () => {
    const items = [
      makeAnnouncement({ id: "ann-1", body: "Regular update.", pinned: false }),
      makeAnnouncement({ id: "ann-2", body: "Pinned update.", pinned: true }),
    ];
    render(<AnnouncementList tripId="trip-1" isOrganizer={false} initialAnnouncements={items} memberUserMap={EMPTY_MAP} />);

    // The pinned banner shows the headline collapsed...
    expect(screen.getByTestId("pinned-banner-headline")).toHaveTextContent(
      "Pinned update."
    );
    // ...and the regular feed only carries the non-pinned item.
    expect(screen.getByText("Regular update.")).toBeInTheDocument();
    expect(screen.queryByTestId("announcement-body")).toHaveTextContent(
      "Regular update."
    );
  });

  it("#470: tapping the pinned banner expands the full pinned card in place", () => {
    const items = [
      makeAnnouncement({ id: "ann-2", body: "Pinned update.", pinned: true }),
    ];
    render(<AnnouncementList tripId="trip-1" isOrganizer={false} initialAnnouncements={items} memberUserMap={EMPTY_MAP} />);

    const trigger = screen.getByRole("button", { expanded: false });
    expect(trigger).toBeInTheDocument();

    fireEvent.click(trigger);

    expect(screen.getByRole("button", { expanded: true })).toBeInTheDocument();
    // The full card body renders once expanded (same text, now in the
    // expanded panel rather than only the truncated headline).
    const bodies = screen.getAllByText("Pinned update.");
    expect(bodies.length).toBeGreaterThanOrEqual(2);
  });

  it("#470: renders no pinned banner when there are no pinned announcements", () => {
    const items = [makeAnnouncement({ body: "Regular update.", pinned: false })];
    render(<AnnouncementList tripId="trip-1" isOrganizer={false} initialAnnouncements={items} memberUserMap={EMPTY_MAP} />);
    expect(screen.queryByTestId("pinned-banner-headline")).not.toBeInTheDocument();
  });

  it("calls subscribeToAnnouncements on mount with the correct tripId", async () => {
    render(<AnnouncementList tripId="trip-42" isOrganizer={false} initialAnnouncements={[]} memberUserMap={EMPTY_MAP} />);
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
    render(<AnnouncementList tripId="trip-1" isOrganizer={false} initialAnnouncements={[]} memberUserMap={EMPTY_MAP} />);
    await flushSubscription();
    expect(ensureRealtimeAuth).toHaveBeenCalledTimes(1);
    const authOrder =
      vi.mocked(ensureRealtimeAuth).mock.invocationCallOrder[0];
    const subscribeOrder =
      vi.mocked(subscribeToAnnouncements).mock.invocationCallOrder[0];
    expect(authOrder).toBeLessThan(subscribeOrder);
  });

  it("adds a new announcement to the list when the realtime callback fires", async () => {
    render(<AnnouncementList tripId="trip-1" isOrganizer={false} initialAnnouncements={[]} memberUserMap={EMPTY_MAP} />);
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
      <AnnouncementList tripId="trip-1" isOrganizer={false} initialAnnouncements={[existing]} memberUserMap={EMPTY_MAP} />
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
      <AnnouncementList tripId="trip-1" isOrganizer={false} initialAnnouncements={[]} memberUserMap={EMPTY_MAP} />
    );
    await flushSubscription();
    unmount();
    const supabase = vi.mocked(createClient)();
    expect(supabase.removeChannel).toHaveBeenCalledWith(mockChannel);
  });

  it("does not render the empty state when there are announcements", () => {
    const items = [makeAnnouncement({ body: "Something happened." })];
    render(<AnnouncementList tripId="trip-1" isOrganizer={false} initialAnnouncements={items} memberUserMap={EMPTY_MAP} />);
    expect(screen.queryByText(/all quiet/i)).not.toBeInTheDocument();
  });

  it("#470: a pinned realtime arrival lands in the banner, not the regular feed", async () => {
    const existing = makeAnnouncement({
      id: "ann-existing",
      body: "Regular update.",
      pinned: false,
      created_at: "2026-05-20T09:00:00Z",
    });
    render(
      <AnnouncementList tripId="trip-1" isOrganizer={false} initialAnnouncements={[existing]} memberUserMap={EMPTY_MAP} />
    );
    await flushSubscription();

    const pinnedIncoming = makeAnnouncement({
      id: "ann-pinned",
      body: "Pinned later but should float to the banner.",
      pinned: true,
      created_at: "2026-05-20T10:00:00Z",
    });
    act(() => {
      capturedOnInsert?.(pinnedIncoming);
    });

    expect(screen.getByTestId("pinned-banner-headline")).toHaveTextContent(
      "Pinned later but should float to the banner."
    );
    expect(screen.getByText("Regular update.")).toBeInTheDocument();
  });

  it("renders the feed with aria-live='polite' for screen-reader updates", () => {
    const items = [makeAnnouncement({ body: "Visible announcement." })];
    render(<AnnouncementList tripId="trip-1" isOrganizer={false} initialAnnouncements={items} memberUserMap={EMPTY_MAP} />);
    const list = screen.getByRole("list");
    expect(list).toHaveAttribute("aria-live", "polite");
  });

  // #393 — organizer-only overflow menu. Must reach BOTH the regular feed
  // AND the pinned banner's expanded cards (the exact bug the issue is
  // about, one layer deeper than the RLS policy itself).
  describe("organizer overflow menu (#393)", () => {
    it("renders the overflow menu on a regular-feed card when isOrganizer=true", () => {
      const items = [makeAnnouncement({ id: "ann-1", body: "Regular update." })];
      render(
        <AnnouncementList
          tripId="trip-1"
          isOrganizer={true}
          initialAnnouncements={items}
          memberUserMap={EMPTY_MAP}
        />
      );
      expect(
        screen.getByRole("button", { name: /post options/i })
      ).toBeInTheDocument();
    });

    it("does not render the overflow menu when isOrganizer=false", () => {
      const items = [makeAnnouncement({ id: "ann-1", body: "Regular update." })];
      render(
        <AnnouncementList
          tripId="trip-1"
          isOrganizer={false}
          initialAnnouncements={items}
          memberUserMap={EMPTY_MAP}
        />
      );
      expect(
        screen.queryByRole("button", { name: /post options/i })
      ).not.toBeInTheDocument();
    });

    it("renders the overflow menu on an expanded pinned card too", () => {
      const items = [
        makeAnnouncement({ id: "ann-pinned", body: "Pinned update.", pinned: true }),
      ];
      render(
        <AnnouncementList
          tripId="trip-1"
          isOrganizer={true}
          initialAnnouncements={items}
          memberUserMap={EMPTY_MAP}
        />
      );
      // Expand the banner.
      fireEvent.click(screen.getByRole("button", { expanded: false }));
      expect(
        screen.getByRole("button", { name: /post options/i })
      ).toBeInTheDocument();
    });

    it("removes the item from the feed on a successful delete", async () => {
      deleteAnnouncementActionMock.mockResolvedValue({ ok: true });
      const items = [makeAnnouncement({ id: "ann-1", body: "Delete me." })];
      render(
        <AnnouncementList
          tripId="trip-1"
          isOrganizer={true}
          initialAnnouncements={items}
          memberUserMap={EMPTY_MAP}
        />
      );

      fireEvent.click(screen.getByRole("button", { name: /post options/i }));
      const deleteItem = await screen.findByTestId("confirm-delete");
      fireEvent.click(deleteItem); // arm
      fireEvent.click(screen.getByTestId("confirm-delete")); // commit

      await act(async () => {});

      expect(screen.queryByText("Delete me.")).not.toBeInTheDocument();
      expect(deleteAnnouncementActionMock).toHaveBeenCalledWith(
        { tripId: "trip-1", announcementId: "ann-1" },
        expect.any(String)
      );
    });

    it("rolls back the optimistic removal when delete fails", async () => {
      deleteAnnouncementActionMock.mockResolvedValue({
        ok: false,
        errorKey: "rls_denied",
      });
      const items = [makeAnnouncement({ id: "ann-1", body: "Stays put." })];
      render(
        <AnnouncementList
          tripId="trip-1"
          isOrganizer={true}
          initialAnnouncements={items}
          memberUserMap={EMPTY_MAP}
        />
      );

      fireEvent.click(screen.getByRole("button", { name: /post options/i }));
      const deleteItem = await screen.findByTestId("confirm-delete");
      fireEvent.click(deleteItem);
      fireEvent.click(screen.getByTestId("confirm-delete"));

      await act(async () => {});

      expect(await screen.findByText("Stays put.")).toBeInTheDocument();
    });

    it("moves a regular post into the pinned banner on a successful pin", async () => {
      pinAnnouncementActionMock.mockResolvedValue({ ok: true, pinned: true });
      const items = [makeAnnouncement({ id: "ann-1", body: "Pin me." })];
      render(
        <AnnouncementList
          tripId="trip-1"
          isOrganizer={true}
          initialAnnouncements={items}
          memberUserMap={EMPTY_MAP}
        />
      );

      fireEvent.click(screen.getByRole("button", { name: /post options/i }));
      fireEvent.click(await screen.findByRole("menuitem", { name: "Pin" }));

      await act(async () => {});

      expect(screen.getByTestId("pinned-banner-headline")).toHaveTextContent(
        "Pin me."
      );
    });

    it("moves a pinned post out of the banner and into the regular feed on unpin", async () => {
      pinAnnouncementActionMock.mockResolvedValue({ ok: true, pinned: false });
      const items = [
        makeAnnouncement({ id: "ann-1", body: "Unpin me.", pinned: true }),
      ];
      render(
        <AnnouncementList
          tripId="trip-1"
          isOrganizer={true}
          initialAnnouncements={items}
          memberUserMap={EMPTY_MAP}
        />
      );

      // Expand the banner to reach the pinned card's menu.
      fireEvent.click(screen.getByRole("button", { expanded: false }));
      fireEvent.click(screen.getByRole("button", { name: /post options/i }));
      fireEvent.click(await screen.findByRole("menuitem", { name: "Unpin" }));

      await act(async () => {});

      expect(
        screen.queryByTestId("pinned-banner-headline")
      ).not.toBeInTheDocument();
      expect(screen.getByText("Unpin me.")).toBeInTheDocument();
    });
  });
});
