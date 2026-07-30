/**
 * Tests for `lib/db/trip-member-days.ts` (#388 — day-scoped attendance).
 *
 * Thin typed wrappers over `trip_member_days`. Two read paths:
 *
 *   - `getMemberDays` — the caller's OWN rows for one trip_member_id
 *     (feeds the /me day chips). Per-member day detail is self +
 *     organizer surface only; peers never see it through this fn
 *     because the caller passes their own member id.
 *   - `getMemberDaysByTrip` — per-member day rows for a whole trip
 *     (feeds the roster "Who's around when" names view — #524).
 *
 * We mock the Supabase fluent builder and assert shape + filters; RLS
 * (M1 migration) enforces the trip-membership boundary in SQL.
 */

import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getMemberDays, getMemberDaysByTrip } from "../trip-member-days";

/**
 * Introspectable Supabase client double — same pattern as
 * `lib/db/__tests__/rsvp.test.ts`. Each chained method records its args
 * on `calls` and returns the same proxy; the terminal promise resolves
 * to the rows you pass in.
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

describe("lib/db/trip-member-days.ts", () => {
  describe("getMemberDays", () => {
    it("queries trip_member_days filtered by trip_member_id, ordered by date", async () => {
      const { calls, client } = makeBuilder([]);

      await getMemberDays(client as unknown as SupabaseClient, "tm-1");

      expect(client.from).toHaveBeenCalledWith("trip_member_days");
      const eqCall = calls.find((c) => c.method === "eq");
      expect(eqCall?.args).toEqual(["trip_member_id", "tm-1"]);
      const orderCall = calls.find((c) => c.method === "order");
      expect(orderCall?.args[0]).toBe("date");
    });

    it("returns the rows as { date, status } pairs", async () => {
      const { client } = makeBuilder([
        { date: "2026-08-14", status: "going" },
        { date: "2026-08-15", status: "declined" },
      ]);

      const rows = await getMemberDays(
        client as unknown as SupabaseClient,
        "tm-1"
      );

      expect(rows).toEqual([
        { date: "2026-08-14", status: "going" },
        { date: "2026-08-15", status: "declined" },
      ]);
    });

    it("returns [] when the member has no seeded rows (rsvp maybe/pending)", async () => {
      const { client } = makeBuilder(null);
      const rows = await getMemberDays(
        client as unknown as SupabaseClient,
        "tm-1"
      );
      expect(rows).toEqual([]);
    });

    it("throws when Supabase reports an error", async () => {
      const { client } = makeBuilder(null, { message: "boom" });
      await expect(
        getMemberDays(client as unknown as SupabaseClient, "tm-1")
      ).rejects.toThrow(/getMemberDays/);
    });
  });

  describe("getMemberDaysByTrip", () => {
    it("scopes by trip via the trip_members inner join and excludes trip-level decliners", async () => {
      const { calls, client } = makeBuilder([]);

      await getMemberDaysByTrip(client as unknown as SupabaseClient, "trip-1");

      expect(client.from).toHaveBeenCalledWith("trip_member_days");
      // trip_member_days has no trip_id column — the trip scope MUST go
      // through the trip_members embed (rule 6: every query scopes by
      // trip_id). An unscoped read would return other trips' days.
      const selectCall = calls.find((c) => c.method === "select");
      expect(String(selectCall?.args[0])).toContain("trip_members!inner");
      expect(String(selectCall?.args[0])).toContain("trip_member_id");
      const eqCalls = calls.filter((c) => c.method === "eq");
      const args = eqCalls.map((c) => `${c.args[0]}=${c.args[1]}`);
      expect(args).toContain("trip_members.trip_id=trip-1");
      // #475: excludes members who declined at the TRIP level, but does
      // NOT require trip-level rsvp_status='going' (rule 8 — a 'maybe'
      // member can still opt individual days in via their own chip).
      const neqCalls = calls.filter((c) => c.method === "neq");
      const neqArgs = neqCalls.map((c) => `${c.args[0]}=${c.args[1]}`);
      expect(neqArgs).toContain("trip_members.rsvp_status=declined");
      expect(args).not.toContain("trip_members.rsvp_status=going");
    });

    it("does NOT filter to status=going — non-going rows ride along for the greyed list", async () => {
      const { calls, client } = makeBuilder([]);

      await getMemberDaysByTrip(client as unknown as SupabaseClient, "trip-1");

      const eqCalls = calls.filter((c) => c.method === "eq");
      const args = eqCalls.map((c) => `${c.args[0]}=${c.args[1]}`);
      expect(args).not.toContain("status=going");
    });

    it("strips the join embed and returns flat member/date/status rows", async () => {
      const { client } = makeBuilder([
        {
          trip_member_id: "tm-1",
          date: "2026-08-14",
          status: "going",
          trip_members: { trip_id: "trip-1", rsvp_status: "going" },
        },
        {
          trip_member_id: "tm-2",
          date: "2026-08-14",
          status: "declined",
          trip_members: { trip_id: "trip-1", rsvp_status: "maybe" },
        },
      ]);

      const rows = await getMemberDaysByTrip(
        client as unknown as SupabaseClient,
        "trip-1"
      );

      expect(rows).toEqual([
        { trip_member_id: "tm-1", date: "2026-08-14", status: "going" },
        { trip_member_id: "tm-2", date: "2026-08-14", status: "declined" },
      ]);
    });

    it("returns [] when no rows come back", async () => {
      const { client } = makeBuilder(null);
      const rows = await getMemberDaysByTrip(
        client as unknown as SupabaseClient,
        "trip-1"
      );
      expect(rows).toEqual([]);
    });

    it("throws when Supabase reports an error", async () => {
      const { client } = makeBuilder(null, { message: "boom" });
      await expect(
        getMemberDaysByTrip(client as unknown as SupabaseClient, "trip-1")
      ).rejects.toThrow(/getMemberDaysByTrip/);
    });
  });
});
