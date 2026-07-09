/**
 * TDD RED — written before implementation of lib/utils/format-trip-tz.ts.
 *
 * Covers:
 *   1. toLocalInputValue formats UTC ISO in trip TZ (basic)
 *   2. fromLocalInputValue parses local input in trip TZ to UTC ISO
 *   3. Inverse round-trip consistency
 *   4. Invalid ISO input → empty string for toLocalInputValue
 *   5. null/undefined input → empty string for toLocalInputValue
 *   6. Empty string → null for fromLocalInputValue
 *   7. Invalid string → null for fromLocalInputValue
 *   8. DST spring-forward boundary (America/New_York, 2026-03-08)
 *   9. DST fall-back boundary (America/New_York, 2026-11-01)
 *  10. Cross-coast: same UTC renders different local times per TZ
 *  11. formatTripDateTime — TZ-invariance (the #254 regression lock)
 *  12. formatTripDateTime — correctness across timezones
 *  13. formatTripDateTime — lowercase am/pm anti-tell
 *  14. formatTripDateTime — bad-data fallback
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  toLocalInputValue,
  fromLocalInputValue,
  formatTripDateTime,
  timezoneCityLabel,
} from "../format-trip-tz";

// -------------------------------------------------------------------------
// toLocalInputValue
// -------------------------------------------------------------------------

describe("toLocalInputValue", () => {
  it("formats UTC ISO to YYYY-MM-DDTHH:mm in Eastern (EDT)", () => {
    // 2026-06-01 03:00 UTC = 2026-05-31 23:00 EDT (UTC-4)
    const result = toLocalInputValue("2026-06-01T03:00:00Z", "America/New_York");
    expect(result).toBe("2026-05-31T23:00");
  });

  it("formats UTC ISO in Pacific time (PDT)", () => {
    // 2026-06-01 07:00 UTC = 2026-06-01 00:00 PDT (UTC-7)
    const result = toLocalInputValue("2026-06-01T07:00:00Z", "America/Los_Angeles");
    expect(result).toBe("2026-06-01T00:00");
  });

  it("formats UTC ISO in UTC timezone", () => {
    const result = toLocalInputValue("2026-07-04T12:30:00Z", "UTC");
    expect(result).toBe("2026-07-04T12:30");
  });

  it("returns empty string for null input", () => {
    const result = toLocalInputValue(null, "America/New_York");
    expect(result).toBe("");
  });

  it("returns empty string for undefined input", () => {
    const result = toLocalInputValue(undefined, "America/New_York");
    expect(result).toBe("");
  });

  it("returns empty string for empty string input", () => {
    const result = toLocalInputValue("", "America/New_York");
    expect(result).toBe("");
  });

  it("returns empty string for invalid ISO string", () => {
    const result = toLocalInputValue("not-a-date", "America/New_York");
    expect(result).toBe("");
  });

  it("handles DST spring-forward: 2026-03-08 07:00 UTC = 03:00 EDT (UTC-4, post-spring)", () => {
    // Spring forward at 2am EST → 3am EDT on 2026-03-08
    // 07:00 UTC = 03:00 EDT
    const result = toLocalInputValue("2026-03-08T07:00:00Z", "America/New_York");
    expect(result).toBe("2026-03-08T03:00");
  });

  it("handles DST fall-back: 2026-11-01 06:00 UTC = 01:00 EST (UTC-5, post-fall-back)", () => {
    // Fall back at 2am EDT → 1am EST on 2026-11-01
    // 06:00 UTC = 01:00 EST (first occurrence, unambiguous after fall-back)
    const result = toLocalInputValue("2026-11-01T06:00:00Z", "America/New_York");
    expect(result).toBe("2026-11-01T01:00");
  });

  it("cross-coast: same UTC time renders different local times", () => {
    const utcIso = "2026-08-15T18:00:00Z";
    const eastern = toLocalInputValue(utcIso, "America/New_York"); // UTC-4 = 14:00
    const pacific = toLocalInputValue(utcIso, "America/Los_Angeles"); // UTC-7 = 11:00
    expect(eastern).toBe("2026-08-15T14:00");
    expect(pacific).toBe("2026-08-15T11:00");
    expect(eastern).not.toBe(pacific);
  });
});

// -------------------------------------------------------------------------
// fromLocalInputValue
// -------------------------------------------------------------------------

describe("fromLocalInputValue", () => {
  it("parses local input in Eastern TZ to UTC ISO", () => {
    // 2026-05-31 23:00 EDT (UTC-4) → 2026-06-01T03:00:00.000Z
    const result = fromLocalInputValue("2026-05-31T23:00", "America/New_York");
    expect(result).toBe("2026-06-01T03:00:00.000Z");
  });

  it("parses local input in Pacific TZ to UTC ISO", () => {
    // 2026-06-01 00:00 PDT (UTC-7) → 2026-06-01T07:00:00.000Z
    const result = fromLocalInputValue("2026-06-01T00:00", "America/Los_Angeles");
    expect(result).toBe("2026-06-01T07:00:00.000Z");
  });

  it("parses local input in UTC", () => {
    const result = fromLocalInputValue("2026-07-04T12:30", "UTC");
    expect(result).toBe("2026-07-04T12:30:00.000Z");
  });

  it("returns null for empty string", () => {
    const result = fromLocalInputValue("", "America/New_York");
    expect(result).toBeNull();
  });

  it("returns null for invalid local value", () => {
    const result = fromLocalInputValue("not-a-date", "America/New_York");
    expect(result).toBeNull();
  });

  it("round-trips: toLocalInputValue then fromLocalInputValue recovers UTC", () => {
    const originalUtc = "2026-06-01T03:00:00.000Z";
    const local = toLocalInputValue(originalUtc, "America/New_York");
    const recovered = fromLocalInputValue(local, "America/New_York");
    expect(recovered).toBe(originalUtc);
  });

  it("DST spring-forward round-trip", () => {
    const originalUtc = "2026-03-08T07:00:00.000Z";
    const local = toLocalInputValue(originalUtc, "America/New_York");
    const recovered = fromLocalInputValue(local, "America/New_York");
    expect(recovered).toBe(originalUtc);
  });
});

// -------------------------------------------------------------------------
// #382 — travel-leg trip-TZ contract. A member on an off-TZ device typing a
// wall-clock time straight off the boarding pass (trip-local) must see the
// same wall clock back — never the device-TZ reinterpretation that shifted
// "10:45" to "7:45 am" for an EDT device on a Pacific trip.
// -------------------------------------------------------------------------

describe("trip-TZ round-trip is device-TZ-independent (#382)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("EDT device: trip-local input parses to the trip-TZ instant, not the device's", () => {
    vi.stubEnv("TZ", "America/New_York"); // the off-TZ device
    // User types 14:30 off the boarding pass — Pacific (trip) time.
    const stored = fromLocalInputValue(
      "2026-08-01T14:30",
      "America/Los_Angeles"
    );
    // 14:30 PDT = 21:30 UTC. The buggy device-TZ parse stored 18:30 UTC.
    expect(stored).toBe("2026-08-01T21:30:00.000Z");
  });

  it("EDT device: the stored instant renders back as the same trip-local wall clock", () => {
    vi.stubEnv("TZ", "America/New_York");
    const localAgain = toLocalInputValue(
      "2026-08-01T21:30:00.000Z",
      "America/Los_Angeles"
    );
    expect(localAgain).toBe("2026-08-01T14:30");
  });

  it("full round-trip: identical wall clock out for any ambient device TZ", () => {
    for (const deviceTz of ["America/New_York", "UTC", "Asia/Tokyo"]) {
      vi.stubEnv("TZ", deviceTz);
      const stored = fromLocalInputValue(
        "2026-08-01T10:45",
        "America/Los_Angeles"
      );
      expect(stored).toBe("2026-08-01T17:45:00.000Z");
      expect(toLocalInputValue(stored, "America/Los_Angeles")).toBe(
        "2026-08-01T10:45"
      );
    }
  });
});

// -------------------------------------------------------------------------
// timezoneCityLabel — feeds the #382 "times are {city} time" form caption
// -------------------------------------------------------------------------

describe("timezoneCityLabel", () => {
  it("extracts the city from an IANA zone, underscores become spaces", () => {
    expect(timezoneCityLabel("America/Los_Angeles")).toBe("Los Angeles");
  });

  it("handles single-word cities", () => {
    expect(timezoneCityLabel("America/Denver")).toBe("Denver");
  });

  it("uses the last segment of multi-segment zones", () => {
    expect(timezoneCityLabel("America/Argentina/Buenos_Aires")).toBe(
      "Buenos Aires"
    );
  });

  it("falls back to the raw string for segment-less zones", () => {
    expect(timezoneCityLabel("UTC")).toBe("UTC");
  });
});

// -------------------------------------------------------------------------
// formatTripDateTime — #254 regression lock
// -------------------------------------------------------------------------

describe("formatTripDateTime", () => {
  // Restore any TZ manipulation after each test.
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  /**
   * TZ-invariance (the core #254 property).
   *
   * The same ISO instant must produce identical output regardless of what
   * process.env.TZ is set to. This is what proves the hydration mismatch
   * is gone: the server (UTC) and the browser (any tz) will render the
   * same string.
   *
   * Strategy: run under two ambient TZs, assert the outputs are identical,
   * then assert the exact expected string (machine-TZ-independent).
   */
  it("TZ-invariance: output is identical regardless of ambient process.env.TZ", () => {
    // 2026-08-14 at 10:30 am America/New_York = 14:30 UTC
    const iso = "2026-08-14T14:30:00Z";
    const tripTimezone = "America/New_York";

    vi.stubEnv("TZ", "UTC");
    const underUtc = formatTripDateTime(iso, tripTimezone);

    vi.stubEnv("TZ", "America/Los_Angeles");
    const underPacific = formatTripDateTime(iso, tripTimezone);

    // Same output regardless of ambient TZ.
    expect(underUtc).toBe(underPacific);
    // Exact string: 10:30 am in America/New_York.
    expect(underUtc).toBe("Aug 14, 10:30 am");
  });

  it("formats an UTC instant correctly in America/New_York (EDT, UTC-4)", () => {
    // 2026-08-14T14:30:00Z = 10:30 am EDT
    expect(formatTripDateTime("2026-08-14T14:30:00Z", "America/New_York")).toBe(
      "Aug 14, 10:30 am"
    );
  });

  it("formats the same UTC instant differently in America/Los_Angeles (PDT, UTC-7)", () => {
    // 2026-08-14T14:30:00Z = 7:30 am PDT
    expect(
      formatTripDateTime("2026-08-14T14:30:00Z", "America/Los_Angeles")
    ).toBe("Aug 14, 7:30 am");
  });

  it("cross-tz: same instant produces different, offset-correct wall-clock strings", () => {
    const iso = "2026-08-14T14:30:00Z";
    const eastern = formatTripDateTime(iso, "America/New_York"); // 10:30 am EDT
    const pacific = formatTripDateTime(iso, "America/Los_Angeles"); // 7:30 am PDT
    expect(eastern).not.toBe(pacific);
    expect(eastern).toBe("Aug 14, 10:30 am");
    expect(pacific).toBe("Aug 14, 7:30 am");
  });

  it("renders pm times in lowercase — anti-tell guard", () => {
    // 2026-08-14T23:45:00Z = 7:45 pm EDT (UTC-4)
    const result = formatTripDateTime("2026-08-14T23:45:00Z", "America/New_York");
    expect(result).toContain("pm");
    expect(result).not.toContain("PM");
  });

  it("renders am times in lowercase — anti-tell guard", () => {
    // 2026-08-14T10:00:00Z = 6:00 am EDT (UTC-4)
    const result = formatTripDateTime("2026-08-14T10:00:00Z", "America/New_York");
    expect(result).toContain("am");
    expect(result).not.toContain("AM");
  });

  it("bad-data: returns raw iso and does not throw for an invalid iso string", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const raw = "not-a-date";
    const result = formatTripDateTime(raw, "America/New_York");
    expect(result).toBe(raw);
    expect(consoleSpy).toHaveBeenCalledWith(
      "[arrivals] formatTripDateTime failed:",
      expect.objectContaining({ iso: raw })
    );
    consoleSpy.mockRestore();
  });

  it("bad-data: does not throw for an invalid timezone, returns raw iso", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const iso = "2026-08-14T14:30:00Z";
    const result = formatTripDateTime(iso, "Not/A_Timezone");
    expect(result).toBe(iso);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
