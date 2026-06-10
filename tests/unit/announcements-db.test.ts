/**
 * announcements data-layer — enrichment + realtime payload tests (#239).
 *
 * TDD RED: these tests must fail before the implementation is wired.
 *
 * Override C: tests live in tests/unit/ only.
 *
 * Strategy (W1c ADR, settled by #250): announcements.created_by references
 * auth.users (not trip_members), so there is no direct PostgREST FK join
 * available. The page layer fetches trip_members separately, builds a
 * memberUserMap (user_id → display_name), and passes the fetched rows
 * through `enrichAnnouncements` — the single post-fetch enrichment path.
 * getAnnouncements itself returns flat rows; subscribeToAnnouncements
 * captures the map at subscription time and enriches each INSERT payload
 * before invoking onInsert.
 *
 * Tests assert:
 *   1. getAnnouncements + enrichAnnouncements populates authorDisplayName
 *   2. enrichment sets authorDisplayName null when created_by not in map
 *   3. subscribeToAnnouncements passes enriched payload with authorDisplayName
 *   4. Realtime fallback: missing member emits "Someone" (not "Guest")
 *   5. Realtime fallback: null created_by emits "Someone"
 */

import { describe, it, expect, vi, type Mock } from "vitest";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import type { Announcement } from "@/lib/db/types";

// ---------------------------------------------------------------------------
// Supabase mock helpers
// ---------------------------------------------------------------------------

type PostgresChangesCallback = (payload: { new: Partial<Announcement> }) => void;

function makeAnnouncementsRows(
  overrides?: Partial<Omit<Announcement, "authorDisplayName">>[]
): Omit<Announcement, "authorDisplayName">[] {
  return (overrides ?? []).map((o, i) => ({
    id: `ann-${i}`,
    trip_id: "trip-001",
    author_id: "user-uuid-1",
    body: `Body ${i}`,
    pinned: false,
    created_at: "2026-05-22T18:00:00Z",
    idempotency_key: null,
    visibility: "everyone" as const,
    created_by: "user-uuid-1",
    ...o,
  }));
}

function makeSupabaseMock(selectData: unknown[] = []) {
  const announcementsChain = {
    select: vi.fn(() => announcementsChain),
    eq: vi.fn(() => announcementsChain),
    order: vi.fn(() => announcementsChain),
    then: (resolve: (v: { data: unknown; error: null }) => void) => {
      resolve({ data: selectData, error: null });
    },
  };

  let capturedInsertCallback: PostgresChangesCallback | null = null;

  const channelMock = {
    on: vi.fn(
      (
        _event: string,
        _filter: unknown,
        callback: PostgresChangesCallback
      ) => {
        capturedInsertCallback = callback;
        return channelMock;
      }
    ),
    subscribe: vi.fn(() => channelMock),
  };

  const supabase = {
    from: vi.fn(() => announcementsChain),
    channel: vi.fn(() => channelMock),
    _fireInsert: (row: Partial<Announcement>) => {
      capturedInsertCallback?.({ new: row });
    },
  };

  return supabase;
}

// ---------------------------------------------------------------------------
// Import under test
// ---------------------------------------------------------------------------

import {
  enrichAnnouncements,
  getAnnouncements,
  subscribeToAnnouncements,
} from "@/lib/db/announcements";

// ---------------------------------------------------------------------------
// getAnnouncements + enrichAnnouncements — authorDisplayName enrichment
// ---------------------------------------------------------------------------

describe("getAnnouncements + enrichAnnouncements — authorDisplayName", () => {
  it("populates authorDisplayName from memberUserMap when created_by matches", async () => {
    const rows = makeAnnouncementsRows([{ created_by: "user-uuid-1" }]);
    const supabase = makeSupabaseMock(rows);
    const memberUserMap = new Map([["user-uuid-1", "Alice"]]);

    const fetched = await getAnnouncements(
      supabase as unknown as Parameters<typeof getAnnouncements>[0],
      "trip-001"
    );
    const results = enrichAnnouncements(fetched, memberUserMap);

    expect(results).toHaveLength(1);
    expect(results[0].authorDisplayName).toBe("Alice");
  });

  it("sets authorDisplayName to null when created_by is not in memberUserMap", async () => {
    const rows = makeAnnouncementsRows([{ created_by: "user-uuid-orphan" }]);
    const supabase = makeSupabaseMock(rows);
    const memberUserMap = new Map<string, string | null>(); // empty

    const fetched = await getAnnouncements(
      supabase as unknown as Parameters<typeof getAnnouncements>[0],
      "trip-001"
    );
    const results = enrichAnnouncements(fetched, memberUserMap);

    expect(results[0].authorDisplayName).toBeNull();
  });

  it("sets authorDisplayName to null when created_by is null", async () => {
    const rows = makeAnnouncementsRows([{ created_by: null }]);
    const supabase = makeSupabaseMock(rows);
    const memberUserMap = new Map([["user-uuid-1", "Alice"]]);

    const fetched = await getAnnouncements(
      supabase as unknown as Parameters<typeof getAnnouncements>[0],
      "trip-001"
    );
    const results = enrichAnnouncements(fetched, memberUserMap);

    expect(results[0].authorDisplayName).toBeNull();
  });

  it("leaves authorDisplayName undefined on un-enriched getAnnouncements rows", async () => {
    const rows = makeAnnouncementsRows([{ created_by: "user-uuid-1" }]);
    const supabase = makeSupabaseMock(rows);

    const results = await getAnnouncements(
      supabase as unknown as Parameters<typeof getAnnouncements>[0],
      "trip-001"
      // no enrichment — flat rows
    );

    expect(results[0].authorDisplayName).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// subscribeToAnnouncements — realtime payload assembly
// ---------------------------------------------------------------------------

describe("subscribeToAnnouncements — realtime payload", () => {
  it("enriches INSERT payload with authorDisplayName from memberUserMap", () => {
    const supabase = makeSupabaseMock();
    const onInsert = vi.fn();
    const memberUserMap = new Map<string, string | null>([
      ["user-uuid-1", "Bob"],
    ]);

    subscribeToAnnouncements(
      supabase as unknown as Parameters<typeof subscribeToAnnouncements>[0],
      "trip-001",
      onInsert,
      memberUserMap
    );

    supabase._fireInsert({
      id: "ann-2",
      trip_id: "trip-001",
      author_id: "user-uuid-1",
      created_by: "user-uuid-1",
      body: "Live update!",
      pinned: false,
      created_at: "2026-05-22T19:00:00Z",
      idempotency_key: null,
      visibility: "everyone",
    });

    expect(onInsert).toHaveBeenCalledOnce();
    const passedPayload = (onInsert as Mock).mock.calls[0][0];
    expect(passedPayload.authorDisplayName).toBe("Bob");
  });

  it("emits announcements_author_fallback when created_by is not in memberUserMap", () => {
    const supabase = makeSupabaseMock();
    const onInsert = vi.fn();
    const memberUserMap = new Map<string, string | null>(); // empty

    subscribeToAnnouncements(
      supabase as unknown as Parameters<typeof subscribeToAnnouncements>[0],
      "trip-001",
      onInsert,
      memberUserMap
    );

    supabase._fireInsert({
      id: "ann-3",
      trip_id: "trip-001",
      author_id: "unknown-user",
      created_by: "unknown-user",
      body: "Mystery post",
      pinned: false,
      created_at: "2026-05-22T19:30:00Z",
      idempotency_key: null,
      visibility: "everyone",
    });

    expect(onInsert).toHaveBeenCalledOnce();
    const passedPayload = (onInsert as Mock).mock.calls[0][0];
    // Must be "Someone", NOT "Guest"
    expect(passedPayload.authorDisplayName).toBe(
      M3_UI_STRINGS.announcements_author_fallback
    );
    expect(passedPayload.authorDisplayName).toBe("Someone");
    expect(passedPayload.authorDisplayName).not.toBe(
      M3_UI_STRINGS.roster_member_fallback_name // "Guest"
    );
  });

  it('emits "Someone" when created_by is null (legacy row without created_by)', () => {
    const supabase = makeSupabaseMock();
    const onInsert = vi.fn();
    const memberUserMap = new Map<string, string | null>([
      ["user-uuid-1", "Charlie"],
    ]);

    subscribeToAnnouncements(
      supabase as unknown as Parameters<typeof subscribeToAnnouncements>[0],
      "trip-001",
      onInsert,
      memberUserMap
    );

    supabase._fireInsert({
      id: "ann-4",
      trip_id: "trip-001",
      author_id: "old-author",
      created_by: null,
      body: "Legacy post",
      pinned: false,
      created_at: "2026-05-22T19:45:00Z",
      idempotency_key: null,
      visibility: "everyone",
    });

    const passedPayload = (onInsert as Mock).mock.calls[0][0];
    expect(passedPayload.authorDisplayName).toBe("Someone");
    expect(passedPayload.authorDisplayName).not.toBe("Guest");
  });
});
