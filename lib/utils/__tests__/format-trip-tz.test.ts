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
 */

import { describe, it, expect } from "vitest";
import { toLocalInputValue, fromLocalInputValue } from "../format-trip-tz";

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
