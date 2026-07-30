/**
 * Unit tests for legNoteForDay (#524) — the travel-leg annotation on
 * the roster "Who's around when" expanded names.
 *
 * The load-bearing case is the TZ boundary: leg instants are UTC,
 * trip days are trip-local calendar dates. A red-eye landing 00:30
 * LA time is 07:30 UTC the SAME day, but a 23:30 LA landing is 06:30
 * UTC the NEXT day — the note must follow the trip-local date.
 */

import { describe, expect, it } from "vitest";

import { legNoteForDay } from "../leg-day-note";

const TZ = "America/Los_Angeles";

function leg(
  direction: "inbound" | "outbound",
  arrive_at: string | null,
  depart_at: string | null
) {
  return { direction, arrive_at, depart_at };
}

describe("legNoteForDay", () => {
  it("annotates an inbound leg's arrival on its trip-local day", () => {
    // 2026-08-14 17:30 UTC = 10:30 am PDT.
    const legs = [leg("inbound", "2026-08-14T17:30:00Z", null)];
    expect(legNoteForDay(legs, "2026-08-14", TZ)).toBe("lands 10:30 am");
    expect(legNoteForDay(legs, "2026-08-15", TZ)).toBeNull();
  });

  it("TZ boundary: a late-evening local landing is next-day in UTC but annotates the local day", () => {
    // 23:30 PDT on Aug 14 = 06:30 UTC on Aug 15.
    const legs = [leg("inbound", "2026-08-15T06:30:00Z", null)];
    expect(legNoteForDay(legs, "2026-08-14", TZ)).toBe("lands 11:30 pm");
    expect(legNoteForDay(legs, "2026-08-15", TZ)).toBeNull();
  });

  it("TZ boundary: a red-eye landing 00:30 local annotates the local landing day", () => {
    // 00:30 PDT on Aug 15 = 07:30 UTC on Aug 15.
    const legs = [leg("inbound", "2026-08-15T07:30:00Z", null)];
    expect(legNoteForDay(legs, "2026-08-15", TZ)).toBe("lands 12:30 am");
    expect(legNoteForDay(legs, "2026-08-14", TZ)).toBeNull();
  });

  it("annotates an outbound leg's departure ('leaves'), not its arrival", () => {
    // Departs 3:00 pm PDT Aug 16 (22:00 UTC); arrival instant ignored.
    const legs = [
      leg("outbound", "2026-08-17T06:00:00Z", "2026-08-16T22:00:00Z"),
    ];
    expect(legNoteForDay(legs, "2026-08-16", TZ)).toBe("leaves 3:00 pm");
    expect(legNoteForDay(legs, "2026-08-17", TZ)).toBeNull();
  });

  it("joins same-day land + leave with a separator", () => {
    const legs = [
      leg("inbound", "2026-08-14T17:30:00Z", null),
      leg("outbound", null, "2026-08-15T04:00:00Z"), // 9:00 pm PDT Aug 14
    ];
    expect(legNoteForDay(legs, "2026-08-14", TZ)).toBe(
      "lands 10:30 am · leaves 9:00 pm"
    );
  });

  it("skips legs missing their direction's instant and returns null when nothing matches", () => {
    const legs = [
      leg("inbound", null, "2026-08-14T17:30:00Z"), // inbound w/o arrive_at
      leg("outbound", "2026-08-14T17:30:00Z", null), // outbound w/o depart_at
    ];
    expect(legNoteForDay(legs, "2026-08-14", TZ)).toBeNull();
    expect(legNoteForDay([], "2026-08-14", TZ)).toBeNull();
  });
});
