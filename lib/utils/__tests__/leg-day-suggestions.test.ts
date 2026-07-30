/**
 * Unit tests for deriveLegDaySuggestions (#525) — leg + own day rows →
 * suggested day-chip mutations. Pure derivation; nothing writes.
 *
 * Trip fixture: Aug 14–18 2026 (fri–tue), America/Los_Angeles.
 */

import { describe, expect, it } from "vitest";

import { deriveLegDaySuggestions } from "../leg-day-suggestions";
import type { MemberDay } from "@/lib/db/trip-member-days";

const TZ = "America/Los_Angeles";
const START = "2026-08-14";
const END = "2026-08-18";

function inbound(arriveAt: string | null) {
  return { direction: "inbound" as const, arrive_at: arriveAt, depart_at: null };
}
function outbound(departAt: string | null) {
  return { direction: "outbound" as const, arrive_at: null, depart_at: departAt };
}
function days(...rows: Array<[string, MemberDay["status"]]>): MemberDay[] {
  return rows.map(([date, status]) => ({ date, status }));
}

function derive(
  leg: ReturnType<typeof inbound> | ReturnType<typeof outbound>,
  memberDays: MemberDay[],
  overrides: Partial<{ tripStartsAt: string | null; tripEndsAt: string | null }> = {}
) {
  return deriveLegDaySuggestions({
    leg,
    memberDays,
    tripStartsAt: START,
    tripEndsAt: END,
    timezone: TZ,
    ...overrides,
  });
}

describe("deriveLegDaySuggestions — inbound", () => {
  it("suggests going for landing day through trip end when nothing is marked", () => {
    // Lands sat aug 15, 10:30 am PDT (17:30 UTC).
    const result = derive(inbound("2026-08-15T17:30:00Z"), []);
    expect(result).toEqual({
      kind: "inbound",
      legDayIso: "2026-08-15",
      days: [
        { date: "2026-08-15", status: "going" },
        { date: "2026-08-16", status: "going" },
        { date: "2026-08-17", status: "going" },
        { date: "2026-08-18", status: "going" },
      ],
    });
  });

  it("fills only up to the current last going day, skipping days already going", () => {
    // Lands fri; sat already going; sun is the last going day.
    const result = derive(
      inbound("2026-08-14T17:30:00Z"),
      days(["2026-08-15", "going"], ["2026-08-16", "going"])
    );
    expect(result?.days).toEqual([{ date: "2026-08-14", status: "going" }]);
  });

  it("returns null when landing day and everything after is already going", () => {
    const result = derive(
      inbound("2026-08-17T17:30:00Z"),
      days(["2026-08-17", "going"], ["2026-08-18", "going"])
    );
    expect(result).toBeNull();
  });

  it("treats a 'declined' day inside the span as unmarked (suggests flipping it)", () => {
    const result = derive(
      inbound("2026-08-16T17:30:00Z"),
      days(["2026-08-16", "declined"], ["2026-08-18", "going"])
    );
    expect(result?.days).toEqual([
      { date: "2026-08-16", status: "going" },
      { date: "2026-08-17", status: "going" },
    ]);
  });

  it("returns null when the last going day is before the landing day (that's a #526 conflict)", () => {
    const result = derive(
      inbound("2026-08-17T17:30:00Z"),
      days(["2026-08-14", "going"], ["2026-08-15", "going"])
    );
    expect(result).toBeNull();
  });

  it("clamps a pre-trip landing to the trip start", () => {
    // Lands aug 12 — before the trip.
    const result = derive(inbound("2026-08-12T17:30:00Z"), []);
    expect(result?.days[0]).toEqual({ date: START, status: "going" });
    expect(result?.days).toHaveLength(5);
  });

  it("returns null for a landing after the trip ends", () => {
    expect(derive(inbound("2026-08-20T17:30:00Z"), [])).toBeNull();
  });

  it("TZ boundary: a late-evening local landing next-day in UTC lands on the local day", () => {
    // 23:30 PDT sat aug 15 = 06:30 UTC sun aug 16.
    const result = derive(inbound("2026-08-16T06:30:00Z"), []);
    expect(result?.legDayIso).toBe("2026-08-15");
  });

  it("returns null when the inbound leg has no arrival instant", () => {
    expect(derive(inbound(null), [])).toBeNull();
  });
});

describe("deriveLegDaySuggestions — outbound", () => {
  it("suggests clearing going days strictly after the departure day", () => {
    // Departs sun aug 16; mon+tue still marked going.
    const result = derive(
      outbound("2026-08-16T22:00:00Z"),
      days(
        ["2026-08-15", "going"],
        ["2026-08-16", "going"],
        ["2026-08-17", "going"],
        ["2026-08-18", "going"]
      )
    );
    expect(result).toEqual({
      kind: "outbound",
      legDayIso: "2026-08-16",
      days: [
        { date: "2026-08-17", status: "declined" },
        { date: "2026-08-18", status: "declined" },
      ],
    });
  });

  it("keeps the departure day itself around", () => {
    const result = derive(
      outbound("2026-08-16T22:00:00Z"),
      days(["2026-08-16", "going"])
    );
    expect(result).toBeNull();
  });

  it("returns null when nothing after the departure is marked going", () => {
    const result = derive(
      outbound("2026-08-16T22:00:00Z"),
      days(["2026-08-17", "declined"], ["2026-08-18", "maybe"])
    );
    expect(result).toBeNull();
  });

  it("returns null when departing on (or after) the trip's last day", () => {
    expect(
      derive(outbound("2026-08-18T22:00:00Z"), days(["2026-08-18", "going"]))
    ).toBeNull();
  });

  it("returns null when the outbound leg has no departure instant", () => {
    expect(derive(outbound(null), days(["2026-08-18", "going"]))).toBeNull();
  });
});

describe("deriveLegDaySuggestions — guards", () => {
  it("returns null for date-less trips", () => {
    expect(
      derive(inbound("2026-08-15T17:30:00Z"), [], { tripStartsAt: null })
    ).toBeNull();
    expect(
      derive(inbound("2026-08-15T17:30:00Z"), [], { tripEndsAt: null })
    ).toBeNull();
  });

  it("returns null for an inverted trip range", () => {
    expect(
      derive(inbound("2026-08-15T17:30:00Z"), [], {
        tripStartsAt: "2026-08-18",
        tripEndsAt: "2026-08-14",
      })
    ).toBeNull();
  });

  it("returns null for an unparseable instant", () => {
    expect(derive(inbound("not-a-date"), [])).toBeNull();
  });
});
