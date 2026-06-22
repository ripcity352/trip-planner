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

import { getMyRsvp, getRsvpCountsForTrip, getOrganizerDeclinedCount } from "../rsvp";

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

/**
 * Builds a client double whose terminal promise resolves to
 * `{ data: null, count, error }` — the shape Supabase returns when
 * `{ head: true, count: "exact" }` is used. Used to test the head-only
 * count path without needing real row payloads.
 */
function makeCountBuilder(count: number | null, error: unknown = null) {
  const calls: Array<{ method: string; args: unknown[] }> = [];

  const thenable: PromiseLike<{
    data: null;
    count: number | null;
    error: unknown;
  }> = {
    then(onfulfilled) {
      return Promise.resolve({ data: null, count, error }).then(onfulfilled);
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

/**
 * Builds a client double over a FIXED dataset whose terminal
 * `.maybeSingle()` APPLIES the recorded `.eq(col, val)` filters against
 * that dataset — mirroring real PostgREST semantics. This makes a test a
 * genuine behavioral guard: if the implementation drops an `.eq()`
 * narrowing, the predicate matches more than one row and `.maybeSingle()`
 * rejects with a PGRST116-shaped error (exactly as Supabase does on a
 * multi-row return), so the test fails behaviorally rather than only via
 * a call-chain assertion.
 */
function makeFilteringBuilder(rows: ReadonlyArray<Record<string, unknown>>) {
  const filters: Array<{ column: string; value: unknown }> = [];

  const matchRow = (row: Record<string, unknown>) =>
    filters.every((f) => row[f.column] === f.value);

  const maybeSingle = async (): Promise<{
    data: unknown;
    error: unknown;
  }> => {
    const matched = rows.filter(matchRow);
    if (matched.length > 1) {
      // Real Supabase raises PGRST116 ("multiple/no rows returned") when
      // .maybeSingle() sees >1 row. Surface it the same way.
      return {
        data: null,
        error: {
          code: "PGRST116",
          message:
            "JSON object requested, multiple (or no) rows returned",
        },
      };
    }
    return { data: matched[0] ?? null, error: null };
  };

  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop: string) {
      if (prop === "maybeSingle") return maybeSingle;
      if (prop === "eq") {
        return (column: string, value: unknown) => {
          filters.push({ column, value });
          return proxy;
        };
      }
      // from / select / any other chained call is a no-op pass-through.
      return () => proxy;
    },
  };

  const proxy: Record<string, unknown> = new Proxy({}, handler);

  return { filters, client: { from: vi.fn(() => proxy) } };
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

    it("returns the CALLER's row when a second member shares the trip_id — behavioral multi-row guard", async () => {
      // Two members of the SAME trip; the builder applies the recorded
      // .eq() filters to this dataset on .maybeSingle(). If the
      // implementation drops the user_id narrowing, the predicate matches
      // BOTH rows → PGRST116 → getMyRsvp throws. So this fails behaviorally
      // (not just via a call-chain assertion) if the filter regresses.
      const { client } = makeFilteringBuilder([
        { id: "tm-caller", user_id: "user-caller", trip_id: "trip-1", rsvp_status: "going" },
        { id: "tm-other", user_id: "user-other", trip_id: "trip-1", rsvp_status: "declined" },
      ]);

      const result = await getMyRsvp(
        client as unknown as SupabaseClient,
        "trip-1",
        "user-caller"
      );

      // Must resolve to the caller's row, not the other member's.
      expect(result).toEqual({ tripMemberId: "tm-caller", status: "going" });
    });
  });

  describe("getOrganizerDeclinedCount", () => {
    it("uses head-only exact-count query (no row payload) for the organizer declined count", async () => {
      // The new implementation uses { count: "exact", head: true } to avoid
      // fetching full rows. The mock returns count: 2 — which must be what
      // the function returns, NOT array length.
      const { calls, client } = makeCountBuilder(2);

      const count = await getOrganizerDeclinedCount(
        client as unknown as SupabaseClient,
        "trip-1"
      );

      expect(count).toBe(2);

      // Assert the select call uses the head-only count shape.
      const selectCall = calls.find((c) => c.method === "select");
      expect(selectCall?.args).toEqual([
        "id",
        { count: "exact", head: true },
      ]);

      const eqCalls = calls.filter((c) => c.method === "eq");
      const filterArgs = eqCalls.map((c) => `${String(c.args[0])}=${String(c.args[1])}`);
      expect(filterArgs).toContain("trip_id=trip-1");
      expect(filterArgs).toContain("rsvp_status=declined");
    });

    it("coalesces null count to 0 (Supabase returns null when head query matches zero rows)", async () => {
      // When there are no declined members, Supabase may return count: null.
      // The function must coalesce to 0.
      const { client } = makeCountBuilder(null);
      const count = await getOrganizerDeclinedCount(
        client as unknown as SupabaseClient,
        "trip-1"
      );
      expect(count).toBe(0);
    });

    it("returns 0 when count is explicitly 0", async () => {
      const { client } = makeCountBuilder(0);
      const count = await getOrganizerDeclinedCount(
        client as unknown as SupabaseClient,
        "trip-1"
      );
      expect(count).toBe(0);
    });

    it("throws when Supabase reports an error", async () => {
      const { client } = makeCountBuilder(null, { message: "boom" });
      await expect(
        getOrganizerDeclinedCount(client as unknown as SupabaseClient, "trip-1")
      ).rejects.toThrow(/getOrganizerDeclinedCount/);
    });
  });
});
