/**
 * Snapshot + constraint tests for the locked dress-code chip list.
 *
 * These chips are voice-locked per Override H (M4 execution plan).
 * Any change — add, remove, reorder — must be intentional and reviewed.
 *
 * Hard bans:
 *   - No "Athleisure" chip (too bland, surfaced in voice testing)
 *   - No bare "Cocktail" (ambiguous out of context)
 */

import { describe, expect, it } from "vitest";
import { DRESS_CODE_CHIPS } from "@/lib/data/dress-codes";

describe("DRESS_CODE_CHIPS", () => {
  it("matches the locked snapshot exactly", () => {
    expect(DRESS_CODE_CHIPS).toMatchInlineSnapshot(`
      [
        "Whatever you've got",
        "Polo + shorts",
        "Sneakers OK",
        "Loud shirts",
        "Cocktail attire",
        "Pool casual",
        "Black tie if you own one",
        "Costume",
      ]
    `);
  });

  it("contains exactly 8 chips", () => {
    expect(DRESS_CODE_CHIPS).toHaveLength(8);
  });

  it("does not contain 'Athleisure' (banned per voice testing)", () => {
    const chips = DRESS_CODE_CHIPS as readonly string[];
    expect(chips.some((c) => c.toLowerCase().includes("athleisure"))).toBe(
      false
    );
  });

  it("does not contain bare 'Cocktail' (ambiguous — must be 'Cocktail attire')", () => {
    const chips = DRESS_CODE_CHIPS as readonly string[];
    expect(chips).not.toContain("Cocktail");
  });

  it("every chip is a non-empty string", () => {
    for (const chip of DRESS_CODE_CHIPS) {
      expect(typeof chip).toBe("string");
      expect(chip.trim().length).toBeGreaterThan(0);
    }
  });

  it("no chip exceeds 40 chars (must fit a 375px chip without wrapping)", () => {
    for (const chip of DRESS_CODE_CHIPS) {
      expect(chip.length, `"${chip}" is too long`).toBeLessThanOrEqual(40);
    }
  });
});
