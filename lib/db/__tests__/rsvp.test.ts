/**
 * Smoke tests for `lib/db/rsvp.ts`.
 *
 * The functions here are thin typed wrappers around the
 * `trip_members_visible_rsvp(viewer_id)` view (declining-whispers
 * source) and the raw `trip_members` table for caller-self lookups.
 * We mock the Supabase fluent builder and assert shape, not behavior —
 * the actual redaction logic lives in SQL (M1 migration) and is
 * exercised by integration tests against a local DB.
 */

import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getMyRsvp, getRsvpCountsForTrip } from "../rsvp";

/**
 * Builds an introspectable Supabase client double. Each chained method
 * records its args on `calls` and returns the same proxy. The terminal
 * promise resolves to the rows you pass in.
 */
function makeBuilder(rows: unknown, error: unknown = null) {
  const calls: Array<{ method: string; args: unknown[] }> = [];

  const thenable: PromiseLike<{ data: unknown; error: unknown }> = {
    then(onfulfilled) {
      return Promise.resolve({ data: rows, error }).then(onfulfilled);
    },
  };

  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop: string) {
      if (prop === "then") return thenable.then.bind(thenable);
      return (...args: unknown[]) => {
        calls.push({ method: prop, args });
        return proxy;
      };
    },
  };

  const proxy: Record<string, unknown> = new Proxy({}, handler);

  return { calls, client: { from: vi.fn(() => proxy) } };
}

describe("lib/db/rsvp.ts", () => {
  describe("getRsvpCountsForTrip", () => {
    it("queries the visible-rsvp view (not raw trip_members) — declining-whispers source", async () => {
      const { calls, client } = makeBuilder([]);

      await getRsvpCountsForTrip(
        client as unknown as SupabaseClient,
        "trip-1"
      );

      // The first .from() call must target the view. Reading the raw
      // trip_members table from the read path would leak per-name
      // declines to non-organizers and is a schema-level bug.
      expect(client.from).toHaveBeenCalledWith("trip_members_visible_rsvp");
      const eqCall = calls.find((c) => c.method === "eq");
      expect(eqCall?.args).toEqual(["trip_id", "trip-1"]);
    });

    it("aggregates rsvp_status counts into { going, maybe, invited }", async () => {
      // Mixed rows including a `null` rsvp_status — that's how the view
      // surfaces a declined member to a non-organizer viewer (the
      // case-when in the M1 migration nulls out the status). The
      // non-organizer-visible case folds null + pending + declined
      // into the `invited` bucket.
      const { client } = makeBuilder([
        { rsvp_status: "going" },
        { rsvp_status: "going" },
        { rsvp_status: "going" },
        { rsvp_status: "maybe" },
        { rsvp_status: "pending" },
        { rsvp_status: null },
        { rsvp_status: null },
      ]);

      const counts = await getRsvpCountsForTrip(
        client as unknown as SupabaseClient,
        "trip-1"
      );

      // 3 going / 1 maybe / 3 invited (1 pending + 2 null-as-redacted)
      expect(counts).toEqual({ going: 3, maybe: 1, invited: 3 });
    });

    it("rolls declined (organizer-visible) into invited for the count shape", async () => {
      // For an organizer viewer the view returns the literal "declined"
      // status. We do NOT add a 4th key to the public counts shape
      // (declining whispers) — declined still rolls into `invited` for
      // the glanceable count. The dashboard renders a separate, gated
      // "(N can't make it)" suffix only when the caller is organizer.
      const { client } = makeBuilder([
        { rsvp_status: "going" },
        { rsvp_status: "declined" },
        { rsvp_status: "declined" },
      ]);

      const counts = await getRsvpCountsForTrip(
        client as unknown as SupabaseClient,
        "trip-1"
      );

      expect(counts).toEqual({ going: 1, maybe: 0, invited: 2 });
    });

    it("returns zeroes when the view returns no rows", async () => {
      const { client } = makeBuilder([]);
      const counts = await getRsvpCountsForTrip(
        client as unknown as SupabaseClient,
        "trip-1"
      );
      expect(counts).toEqual({ going: 0, maybe: 0, invited: 0 });
    });

    it("throws when Supabase reports an error", async () => {
      const { client } = makeBuilder(null, { message: "boom" });
      await expect(
        getRsvpCountsForTrip(client as unknown as SupabaseClient, "trip-1")
      ).rejects.toThrow(/getRsvpCountsForTrip/);
    });
  });

  describe("getMyRsvp", () => {
    it("filters by trip_id AND user_id so an organizer doesn't get a multi-row return", async () => {
      const { calls, client } = makeBuilder({
        id: "tm-1",
        rsvp_status: "maybe",
      });

      const result = await getMyRsvp(
        client as unknown as SupabaseClient,
        "trip-1",
        "user-1"
      );

      expect(result).toEqual({ tripMemberId: "tm-1", status: "maybe" });
      const eqCalls = calls.filter((c) => c.method === "eq");
      const args = eqCalls.map((c) => `${c.args[0]}=${c.args[1]}`);
      expect(args).toContain("trip_id=trip-1");
      expect(args).toContain("user_id=user-1");
    });

    it("returns null when there is no membership row (non-member)", async () => {
      const { client } = makeBuilder(null);
      const result = await getMyRsvp(
        client as unknown as SupabaseClient,
        "trip-1",
        "user-1"
      );
      expect(result).toBeNull();
    });

    it("throws when Supabase reports an error", async () => {
      const { client } = makeBuilder(null, { message: "boom" });
      await expect(
        getMyRsvp(client as unknown as SupabaseClient, "trip-1", "user-1")
      ).rejects.toThrow(/getMyRsvp/);
    });
  });

  describe("getOrganizerDeclinedCount", () => {
    it("queries the raw trip_members table filtered to declined for organizer-only count", async () => {
      // The organizer-visible "X can't make it" parenthetical is the
      // ONLY place in the read path that touches the raw trip_members
      // table — gated by the caller being is_trip_organizer (the page
      // checks that before invoking this fn). RLS still enforces the
      // gate at the row level.
      const { calls, client } = makeBuilder([
        { rsvp_status: "declined" },
        { rsvp_status: "declined" },
      ]);

      const { getOrganizerDeclinedCount } = await import("../rsvp");
      const count = await getOrganizerDeclinedCount(
        client as unknown as SupabaseClient,
        "trip-1"
      );

      expect(count).toBe(2);
      const eqCalls = calls.filter((c) => c.method === "eq");
      const filterArgs = eqCalls.map((c) => `${c.args[0]}=${c.args[1]}`);
      expect(filterArgs).toContain("trip_id=trip-1");
      expect(filterArgs).toContain("rsvp_status=declined");
    });

    it("returns 0 when there are no declined members", async () => {
      const { client } = makeBuilder([]);
      const { getOrganizerDeclinedCount } = await import("../rsvp");
      const count = await getOrganizerDeclinedCount(
        client as unknown as SupabaseClient,
        "trip-1"
      );
      expect(count).toBe(0);
    });
  });
});
