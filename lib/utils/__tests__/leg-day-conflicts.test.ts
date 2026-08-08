/**
 * Unit tests for deriveLegDayConflicts + legDayConflictLine (#526,
 * revised #531) — chips contradict your own legs -> quiet cue. Chips
 * win; nothing writes. An unmarked day (no trip_member_days row at
 * all) is no signal, not a contradiction — only an explicit
 * non-going row (declined/maybe) conflicts.
 *
 * Trip fixture: Aug 14-18 2026 (fri-tue), America/Los_Angeles.
 */

import { describe, expect, it } from "vitest";

import {
  deriveLegDayConflicts,
  legDayConflictLine,
} from "../leg-day-conflicts";
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
  legs: Array<ReturnType<typeof inbound> | ReturnType<typeof outbound>>,
  memberDays: MemberDay[],
  overrides: Partial<{ tripStartsAt: string | null; tripEndsAt: string | null }> = {}
) {
  return deriveLegDayConflicts({
    legs,
    memberDays,
    tripStartsAt: START,
    tripEndsAt: END,
    timezone: TZ,
    ...overrides,
  });
}

describe("deriveLegDayConflicts", () => {
  it("is quiet when the landing day is unmarked (#531 - no row is no signal)", () => {
    expect(derive([inbound("2026-08-15T17:30:00Z")], [])).toEqual([]);
  });

  it("flags an inbound landing on an explicitly declined day", () => {
    expect(
      derive([inbound("2026-08-15T17:30:00Z")], days(["2026-08-15", "declined"]))
    ).toEqual([{ kind: "lands_not_around", date: "2026-08-15" }]);
  });

  it("flags an inbound landing on an explicitly maybe day", () => {
    expect(
      derive([inbound("2026-08-15T17:30:00Z")], days(["2026-08-15", "maybe"]))
    ).toEqual([{ kind: "lands_not_around", date: "2026-08-15" }]);
  });

  it("is quiet when the landing day is marked going", () => {
    expect(
      derive([inbound("2026-08-15T17:30:00Z")], days(["2026-08-15", "going"]))
    ).toEqual([]);
  });

  it("is quiet when the outbound departure day is unmarked (#531 - no row is no signal)", () => {
    expect(derive([outbound("2026-08-16T22:00:00Z")], [])).toEqual([]);
  });

  it("flags an outbound departure on an explicitly declined day", () => {
    expect(
      derive([outbound("2026-08-16T22:00:00Z")], days(["2026-08-16", "declined"]))
    ).toEqual([{ kind: "leaves_not_around", date: "2026-08-16" }]);
  });

  it("flags going days after the outbound departure (chips win - no writes)", () => {
    const result = derive(
      [outbound("2026-08-16T22:00:00Z")],
      days(["2026-08-16", "going"], ["2026-08-17", "going"], ["2026-08-18", "going"])
    );
    expect(result).toEqual([
      {
        kind: "around_after_leaving",
        departDate: "2026-08-16",
        dates: ["2026-08-17", "2026-08-18"],
      },
    ]);
  });

  it("boundary: same-day land + leave on an unmarked day is quiet (#531)", () => {
    const result = derive(
      [inbound("2026-08-15T17:30:00Z"), outbound("2026-08-16T04:00:00Z")],
      []
    );
    expect(result).toEqual([]);
  });

  it("boundary: same-day land + leave on an explicitly declined day yields both direction cues", () => {
    const result = derive(
      [inbound("2026-08-15T17:30:00Z"), outbound("2026-08-16T04:00:00Z")],
      days(["2026-08-15", "declined"])
    );
    expect(result).toEqual([
      { kind: "lands_not_around", date: "2026-08-15" },
      { kind: "leaves_not_around", date: "2026-08-15" },
    ]);
  });

  it("boundary: null instants never conflict", () => {
    expect(derive([inbound(null), outbound(null)], [])).toEqual([]);
  });

  it("boundary: leg days outside the trip range are skipped (no chips to contradict)", () => {
    expect(
      derive(
        [inbound("2026-08-12T17:30:00Z"), inbound("2026-08-20T17:30:00Z")],
        days(["2026-08-12", "declined"], ["2026-08-20", "declined"])
      )
    ).toEqual([]);
    expect(derive([outbound("2026-08-20T22:00:00Z")], days(["2026-08-18", "going"]))).toEqual([]);
  });

  it("boundary: TZ reduction - a next-day-UTC landing conflicts on the trip-local day", () => {
    expect(
      derive([inbound("2026-08-15T06:30:00Z")], days(["2026-08-14", "declined"]))
    ).toEqual([{ kind: "lands_not_around", date: "2026-08-14" }]);
  });

  it("returns [] for date-less trips", () => {
    expect(
      derive([inbound("2026-08-15T17:30:00Z")], [], { tripStartsAt: null })
    ).toEqual([]);
  });

  it("returns [] for unparseable instants", () => {
    expect(derive([inbound("nope")], [])).toEqual([]);
  });
});

describe("legDayConflictLine", () => {
  it("phrases each kind in the lowercase day register", () => {
    expect(
      legDayConflictLine({ kind: "lands_not_around", date: "2026-08-14" })
    ).toBe("heads up — you land fri 14 but aren't marked around");
    expect(
      legDayConflictLine({ kind: "leaves_not_around", date: "2026-08-16" })
    ).toBe("heads up — you leave sun 16 but aren't marked around");
    expect(
      legDayConflictLine({
        kind: "around_after_leaving",
        departDate: "2026-08-16",
        dates: ["2026-08-17"],
      })
    ).toBe("heads up — you leave sun 16 but you're still marked around after");
  });
});
