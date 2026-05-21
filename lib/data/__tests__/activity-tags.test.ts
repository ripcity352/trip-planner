/**
 * Snapshot + constraint tests for the locked activity-tag chip list.
 *
 * These are NEUTRAL seeds only. Bach-coded, explicit, or penis-coded
 * suggestions are hard-banned per notes/killed-and-deferred.md and
 * Phase 2 Voice/Persona C2.
 *
 * Hard-banned terms (case-insensitive):
 *   "strip", "bachelor", "bachelorette", "penis", "dick"
 */

import { describe, expect, it } from "vitest";
import { ACTIVITY_TAG_CHIPS } from "@/lib/data/activity-tags";

const BANNED_TERMS = ["strip", "bachelor", "bachelorette", "penis", "dick"];

describe("ACTIVITY_TAG_CHIPS", () => {
  it("matches the locked snapshot exactly", () => {
    expect(ACTIVITY_TAG_CHIPS).toMatchInlineSnapshot(`
      [
        "meal",
        "bar",
        "club",
        "outdoor",
        "chill",
        "gaming",
        "spa",
        "pool",
        "show",
      ]
    `);
  });

  it("contains exactly 9 chips", () => {
    expect(ACTIVITY_TAG_CHIPS).toHaveLength(9);
  });

  it.each(BANNED_TERMS)(
    "no chip case-insensitively matches banned term '%s'",
    (banned) => {
      const chips = ACTIVITY_TAG_CHIPS as readonly string[];
      expect(
        chips.some((c) => c.toLowerCase().includes(banned.toLowerCase()))
      ).toBe(false);
    }
  );

  it("every chip is a non-empty string", () => {
    for (const chip of ACTIVITY_TAG_CHIPS) {
      expect(typeof chip).toBe("string");
      expect(chip.trim().length).toBeGreaterThan(0);
    }
  });

  it("includes the activity-tag seeds cited in persona-edge-attendees.md Devin section", () => {
    // Sober attendee's balance-audit tags: bar / club / meal / outdoor / gaming / chill
    const chips = ACTIVITY_TAG_CHIPS as readonly string[];
    expect(chips).toContain("bar");
    expect(chips).toContain("club");
    expect(chips).toContain("meal");
    expect(chips).toContain("outdoor");
    expect(chips).toContain("chill");
    expect(chips).toContain("gaming");
  });
});
