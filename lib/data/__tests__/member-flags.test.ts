/**
 * Snapshot + constraint tests for the locked member-flag chip list.
 *
 * These chips are voice-locked per Override H (M4 execution plan).
 * Sourced from persona-edge-attendees.md dietary/sober/late-arrival opt-ins.
 *
 * Hard constraints:
 *   - No "skipping" chip — that path is per-item RSVP, not a member flag
 *   - No empty chip
 *   - No chip > 30 chars (fits a chip component without overflow)
 */

import { describe, expect, it } from "vitest";
import { MEMBER_FLAG_CHIPS } from "@/lib/data/member-flags";

describe("MEMBER_FLAG_CHIPS", () => {
  it("matches the locked snapshot exactly", () => {
    expect(MEMBER_FLAG_CHIPS).toMatchInlineSnapshot(`
      [
        "Vegetarian",
        "Vegan",
        "Gluten-free",
        "Dairy-free",
        "Nut allergy",
        "Shellfish allergy",
        "Sober",
        "Sitting this one out",
        "Late arrival",
      ]
    `);
  });

  it("contains exactly 9 chips", () => {
    expect(MEMBER_FLAG_CHIPS).toHaveLength(9);
  });

  it("no chip contains the word 'skipping' (that path is per-item RSVP)", () => {
    const chips = MEMBER_FLAG_CHIPS as readonly string[];
    expect(
      chips.some((c) => c.toLowerCase().includes("skipping"))
    ).toBe(false);
  });

  it("every chip is a non-empty string", () => {
    for (const chip of MEMBER_FLAG_CHIPS) {
      expect(typeof chip).toBe("string");
      expect(chip.trim().length).toBeGreaterThan(0);
    }
  });

  it("no chip exceeds 30 chars", () => {
    for (const chip of MEMBER_FLAG_CHIPS) {
      expect(chip.length, `"${chip}" exceeds 30 chars`).toBeLessThanOrEqual(
        30
      );
    }
  });

  it("covers the dietary opt-ins from persona-edge-attendees.md", () => {
    const chips = MEMBER_FLAG_CHIPS as readonly string[];
    // Dietary restrictions surfaced by Priya (celiac) persona
    expect(chips).toContain("Vegetarian");
    expect(chips).toContain("Vegan");
    expect(chips).toContain("Gluten-free");
    expect(chips).toContain("Shellfish allergy");
    // Sober attendee (Devin persona)
    expect(chips).toContain("Sober");
    // Late arrival (Hugo persona)
    expect(chips).toContain("Late arrival");
  });
});
