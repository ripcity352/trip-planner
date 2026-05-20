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

// Mock subscribeToAnnouncements so we can control the callback
let capturedOnInsert: ((a: Announcement) => void) | null = null;

vi.mock("@/lib/db/announcements", () => ({
  subscribeToAnnouncements: vi.fn((_supabase, _tripId, onInsert) => {
    capturedOnInsert = onInsert;
    return mockChannel;
  }),
}));

import { subscribeToAnnouncements } from "@/lib/db/announcements";
import { createClient } from "@/lib/supabase/browser";

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
    render(<AnnouncementList tripId="trip-1" initialAnnouncements={[]} />);
    // EMPTY_STATES.announcements = "All quiet. No news is probably good news."
    expect(screen.getByText(/all quiet/i)).toBeInTheDocument();
  });

  it("renders all initial announcements", () => {
    const items = [
      makeAnnouncement({ id: "ann-1", body: "First update." }),
      makeAnnouncement({ id: "ann-2", body: "Second update." }),
    ];
    render(<AnnouncementList tripId="trip-1" initialAnnouncements={items} />);
    expect(screen.getByText("First update.")).toBeInTheDocument();
    expect(screen.getByText("Second update.")).toBeInTheDocument();
  });

  it("renders pinned announcements before non-pinned", () => {
    const items = [
      makeAnnouncement({ id: "ann-1", body: "Regular update.", pinned: false }),
      makeAnnouncement({ id: "ann-2", body: "Pinned update.", pinned: true }),
    ];
    render(<AnnouncementList tripId="trip-1" initialAnnouncements={items} />);

    const cards = screen.getAllByText(/update\./);
    // Pinned should come first in the DOM
    expect(cards[0].textContent).toContain("Pinned update.");
    expect(cards[1].textContent).toContain("Regular update.");
  });

  it("calls subscribeToAnnouncements on mount with the correct tripId", () => {
    render(<AnnouncementList tripId="trip-42" initialAnnouncements={[]} />);
    expect(subscribeToAnnouncements).toHaveBeenCalledWith(
      expect.anything(),
      "trip-42",
      expect.any(Function)
    );
  });

  it("adds a new announcement to the list when the realtime callback fires", () => {
    render(<AnnouncementList tripId="trip-1" initialAnnouncements={[]} />);

    const newItem = makeAnnouncement({ id: "ann-realtime", body: "Live update!" });
    act(() => {
      capturedOnInsert?.(newItem);
    });

    expect(screen.getByText("Live update!")).toBeInTheDocument();
  });

  it("prepends new realtime announcements before existing ones", () => {
    const existing = makeAnnouncement({ id: "ann-existing", body: "Existing." });
    render(
      <AnnouncementList tripId="trip-1" initialAnnouncements={[existing]} />
    );

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

  it("calls removeChannel on unmount to clean up the subscription", () => {
    const { unmount } = render(
      <AnnouncementList tripId="trip-1" initialAnnouncements={[]} />
    );
    unmount();
    const supabase = vi.mocked(createClient)();
    expect(supabase.removeChannel).toHaveBeenCalledWith(mockChannel);
  });

  it("does not render the empty state when there are announcements", () => {
    const items = [makeAnnouncement({ body: "Something happened." })];
    render(<AnnouncementList tripId="trip-1" initialAnnouncements={items} />);
    expect(screen.queryByText(/all quiet/i)).not.toBeInTheDocument();
  });
});
