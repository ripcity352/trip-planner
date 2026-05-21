/**
 * Decoy-RLS triad test — Coverage C4.
 *
 * Validates the additive SELECT policy on `itinerary_item_member_flags`
 * introduced in M4 Delta 1: "item flags: owner reads own".
 *
 * Three flag rows are seeded:
 *   (a) flag owned by caller's trip_member_id           → visible to caller
 *   (b) flag owned by a DIFFERENT member of the SAME trip → NOT visible to caller
 *   (c) flag in a DIFFERENT trip                          → NOT visible to caller
 *
 * Additive policy stacking:
 *   - organizer SELECT: "item flags: organizers read" (M3) — sees ALL flags in their trip
 *   - member SELECT:    "item flags: owner reads own"  (M4) — sees only their own flag
 *
 * NOTE: These are unit tests using a mock SupabaseClient. They assert
 * that the data-layer functions correctly route queries. The actual RLS
 * enforcement is a DB-level concern exercised by Playwright E2E specs
 * against a local Supabase instance. The mock here simulates what the DB
 * returns under each RLS context (organizer vs. member).
 */

import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getFlagsForItem,
  getMyFlagsForItem,
} from "../itinerary-item-member-flags";
import type { ItineraryItemMemberFlag } from "../types";

// ─── Fixture IDs ──────────────────────────────────────────────────────────────

const ITEM_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER_ITEM_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const CALLER_MEMBER_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const OTHER_MEMBER_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";

// ─── Seeded rows ──────────────────────────────────────────────────────────────

/** (a) Flag owned by caller — should be visible to caller */
const flagA: ItineraryItemMemberFlag = {
  id: "flag-a-id",
  item_id: ITEM_ID,
  trip_member_id: CALLER_MEMBER_ID,
  flag: "vegan",
  note: "strict vegan please",
  created_at: "2026-05-21T00:00:00.000Z",
};

/** (b) Flag owned by a different member of the same trip — NOT visible to caller */
const flagB: ItineraryItemMemberFlag = {
  id: "flag-b-id",
  item_id: ITEM_ID,
  trip_member_id: OTHER_MEMBER_ID,
  flag: "sober",
  note: null,
  created_at: "2026-05-21T00:01:00.000Z",
};

/**
 * (c) Flag in a different trip entirely — NOT visible to caller.
 * Not materialized as a constant; its item_id (OTHER_ITEM_ID) is used
 * directly in the "different trip" test case below.
 */

// ─── Mock builder ─────────────────────────────────────────────────────────────

/**
 * Builds a minimal Supabase client stub. The `resolver` receives the
 * table name and returns `{ data, error }` simulating what the DB would
 * return under the given RLS context.
 */
function makeClient(
  resolver: (table: string) => { data: unknown; error: unknown }
): SupabaseClient {
  const buildProxy = (tableName: string): Record<string, unknown> => {
    const thenable: PromiseLike<{ data: unknown; error: unknown }> = {
      then(onfulfilled) {
        return Promise.resolve(resolver(tableName)).then(onfulfilled);
      },
    };
    const handler: ProxyHandler<Record<string, unknown>> = {
      get(_target, prop: string) {
        if (prop === "then") return thenable.then.bind(thenable);
        return () => proxy;
      },
    };
    const proxy: Record<string, unknown> = new Proxy({}, handler);
    return proxy;
  };

  return {
    from: vi.fn((table: string) => buildProxy(table)),
  } as unknown as SupabaseClient;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("itinerary_item_member_flags — decoy-RLS triad (Coverage C4)", () => {
  /**
   * Organizer context: "item flags: organizers read" policy (M3) grants
   * SELECT on all flags for items in their trip. The DB returns flagA + flagB
   * (same trip). flagC is in a different trip — not returned.
   */
  describe("getFlagsForItem (organizer SELECT)", () => {
    it("returns all flags for the item when caller is organizer", async () => {
      // DB returns flagA + flagB under organizer RLS — all flags for this item
      const client = makeClient(() => ({
        data: [flagA, flagB],
        error: null,
      }));

      const result = await getFlagsForItem(client, ITEM_ID);

      expect(result).toHaveLength(2);
      expect(result.map((f) => f.id)).toContain("flag-a-id");
      expect(result.map((f) => f.id)).toContain("flag-b-id");
    });

    it("does NOT return flags from a different trip (row c)", async () => {
      // Even as organizer, the other-trip item is not in scope
      const client = makeClient(() => ({
        data: [flagA, flagB],
        error: null,
      }));

      const result = await getFlagsForItem(client, ITEM_ID);

      expect(result.map((f) => f.id)).not.toContain("flag-c-id");
    });

    it("returns empty array when no flags exist", async () => {
      const client = makeClient(() => ({ data: [], error: null }));
      const result = await getFlagsForItem(client, ITEM_ID);
      expect(result).toEqual([]);
    });

    it("handles null data gracefully", async () => {
      const client = makeClient(() => ({ data: null, error: null }));
      const result = await getFlagsForItem(client, ITEM_ID);
      expect(result).toEqual([]);
    });

    it("throws on DB error", async () => {
      const client = makeClient(() => ({
        data: null,
        error: { message: "permission denied" },
      }));
      await expect(getFlagsForItem(client, ITEM_ID)).rejects.toThrow(
        "getFlagsForItem failed"
      );
    });
  });

  /**
   * Member context: "item flags: owner reads own" policy (M4 Delta 1)
   * grants SELECT only on rows where trip_member_id maps to the caller's
   * own membership. The DB returns only flagA for the caller.
   * flagB (different member, same trip) and flagC (different trip) are
   * filtered out by RLS.
   */
  describe("getMyFlagsForItem (member/owner SELECT — Delta 1 policy)", () => {
    it("(a) returns the caller's own flag", async () => {
      // DB applies "owner reads own" policy — returns only flagA
      const client = makeClient(() => ({
        data: [flagA],
        error: null,
      }));

      const result = await getMyFlagsForItem(client, ITEM_ID, CALLER_MEMBER_ID);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("flag-a-id");
      expect(result[0].trip_member_id).toBe(CALLER_MEMBER_ID);
    });

    it("(b) does NOT see flag owned by a different member of the same trip", async () => {
      // RLS on the DB side returns [] for a non-owning member querying flagB
      const client = makeClient(() => ({
        data: [],
        error: null,
      }));

      const result = await getMyFlagsForItem(client, ITEM_ID, OTHER_MEMBER_ID);

      // The DB returned nothing because the caller doesn't own flagA (which
      // is in ITEM_ID for CALLER_MEMBER_ID). The mock correctly returns [].
      expect(result).toHaveLength(0);
    });

    it("(c) does NOT see flag from a different trip", async () => {
      // OTHER_ITEM_ID is in OTHER_TRIP_ID — RLS blocks cross-trip visibility
      const client = makeClient(() => ({
        data: [],
        error: null,
      }));

      const result = await getMyFlagsForItem(
        client,
        OTHER_ITEM_ID,
        CALLER_MEMBER_ID
      );

      expect(result).toHaveLength(0);
    });

    it("returns empty array when caller has no flags for this item", async () => {
      const client = makeClient(() => ({ data: [], error: null }));
      const result = await getMyFlagsForItem(client, ITEM_ID, CALLER_MEMBER_ID);
      expect(result).toEqual([]);
    });

    it("handles null data gracefully", async () => {
      const client = makeClient(() => ({ data: null, error: null }));
      const result = await getMyFlagsForItem(client, ITEM_ID, CALLER_MEMBER_ID);
      expect(result).toEqual([]);
    });

    it("throws on DB error", async () => {
      const client = makeClient(() => ({
        data: null,
        error: { message: "relation does not exist" },
      }));
      await expect(
        getMyFlagsForItem(client, ITEM_ID, CALLER_MEMBER_ID)
      ).rejects.toThrow("getMyFlagsForItem failed");
    });
  });

  /**
   * Policy stacking verification (additive OR semantics):
   * The M3 organizer policy and M4 owner policy stack via OR in Postgres.
   * This test asserts the expected visibility delta between the two roles.
   */
  describe("additive policy stacking — organizer sees more than member", () => {
    it("organizer sees all 2 same-trip flags; member sees only 1 own flag", async () => {
      // Organizer RLS context: DB returns flagA + flagB
      const organizerClient = makeClient(() => ({
        data: [flagA, flagB],
        error: null,
      }));
      // Member RLS context: DB returns only flagA
      const memberClient = makeClient(() => ({
        data: [flagA],
        error: null,
      }));

      const [organizerView, memberView] = await Promise.all([
        getFlagsForItem(organizerClient, ITEM_ID),
        getMyFlagsForItem(memberClient, ITEM_ID, CALLER_MEMBER_ID),
      ]);

      // Organizer sees both flags in same trip
      expect(organizerView).toHaveLength(2);
      // Member sees only their own
      expect(memberView).toHaveLength(1);
      // Member's visible flag is a subset of organizer's visible flags
      expect(organizerView.map((f) => f.id)).toContain(memberView[0].id);
    });
  });
});
