/**
 * Sanity tests for the empty-state copy palette. We verify shape and
 * length — the *voice* check ("would you say this at a pre-trip dinner?")
 * is a human PR-review item, not something we can assert in code.
 */

import { describe, expect, it } from "vitest";
import {
  EMPTY_STATES,
  EMPTY_STATE_CTAS,
  type EmptyStateKey,
} from "@/lib/copy/empty-states";

const EXPECTED_KEYS: readonly EmptyStateKey[] = [
  "itinerary",
  "members",
  "expenses",
  "announcements",
  "polls",
  "photos",
  "trips_mine",
  "invites_for_trip",
];

// ~120 chars keeps strings to a tweet-line; anything longer is a paragraph,
// which is the wrong primitive for an empty state.
const MAX_LENGTH = 120;

describe("EMPTY_STATES", () => {
  it("covers every key in EmptyStateKey", () => {
    for (const key of EXPECTED_KEYS) {
      expect(EMPTY_STATES).toHaveProperty(key);
    }
    expect(Object.keys(EMPTY_STATES).sort()).toEqual([...EXPECTED_KEYS].sort());
  });

  it("has a non-empty string for every key", () => {
    for (const key of EXPECTED_KEYS) {
      const value = EMPTY_STATES[key];
      expect(typeof value).toBe("string");
      expect(value.trim().length).toBeGreaterThan(0);
    }
  });

  it(`keeps every string under ${MAX_LENGTH} characters`, () => {
    for (const key of EXPECTED_KEYS) {
      expect(EMPTY_STATES[key].length).toBeLessThanOrEqual(MAX_LENGTH);
    }
  });
});

// CTA buttons sit on the mobile target (~375px); much longer than this
// and they wrap or get truncated.
const CTA_MAX_LENGTH = 40;

describe("EMPTY_STATE_CTAS", () => {
  it("has a non-empty trips_mine CTA <= 40 chars", () => {
    const cta = EMPTY_STATE_CTAS.trips_mine;
    expect(typeof cta).toBe("string");
    expect(cta?.trim().length).toBeGreaterThan(0);
    expect(cta?.length ?? 0).toBeLessThanOrEqual(CTA_MAX_LENGTH);
  });
});
