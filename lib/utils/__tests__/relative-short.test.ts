/**
 * Tests for `lib/utils/relative-short.ts` — the abbreviated Relative
 * tier ("22h", "3d"; never "about 22 hours ago", a named anti-tell).
 */

import { describe, expect, it } from "vitest";

import { formatRelativeShort } from "@/lib/utils/relative-short";

const NOW = new Date("2026-07-13T12:00:00Z");

function ago(ms: number): Date {
  return new Date(NOW.getTime() - ms);
}

describe("formatRelativeShort", () => {
  it("renders sub-minute deltas as 'now'", () => {
    expect(formatRelativeShort(ago(30_000), NOW)).toBe("now");
  });

  it("clamps future timestamps (clock skew) to 'now'", () => {
    expect(formatRelativeShort(ago(-90_000), NOW)).toBe("now");
  });

  it("renders minutes below an hour", () => {
    expect(formatRelativeShort(ago(5 * 60_000), NOW)).toBe("5m");
    expect(formatRelativeShort(ago(59 * 60_000), NOW)).toBe("59m");
  });

  it("renders hours below a day", () => {
    expect(formatRelativeShort(ago(60 * 60_000), NOW)).toBe("1h");
    expect(formatRelativeShort(ago(22 * 3_600_000), NOW)).toBe("22h");
  });

  it("renders days below a week", () => {
    expect(formatRelativeShort(ago(24 * 3_600_000), NOW)).toBe("1d");
    expect(formatRelativeShort(ago(3 * 86_400_000), NOW)).toBe("3d");
  });

  it("renders weeks beyond seven days", () => {
    expect(formatRelativeShort(ago(7 * 86_400_000), NOW)).toBe("1w");
    expect(formatRelativeShort(ago(20 * 86_400_000), NOW)).toBe("2w");
  });
});
