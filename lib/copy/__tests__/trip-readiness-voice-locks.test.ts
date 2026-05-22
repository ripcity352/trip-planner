/**
 * Voice-lock tests for Wave 0 trip-readiness copy additions to M3_UI_STRINGS.
 *
 * TDD RED: these tests are written before the new keys exist in the palette.
 * Run `pnpm test` — expect failures until D3 is implemented.
 *
 * Placement: lib/copy/__tests__/ per Override C (never under app/).
 *
 * Voice rules:
 *   - Warm, irreverent, specific. No SaaS-speak.
 *   - No UUID fragments. No "user". No exclamation marks.
 *   - No "leg" / "legs" jargon in arrivals_* keys.
 *   - No first-name drops (e.g. "Dave's") in any M3 key.
 */

import { describe, it, expect } from "vitest";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";

describe("M3_UI_STRINGS — Wave 0 trip-readiness voice locks", () => {
  // ---------------------------------------------------------------------------
  // 5 new keys — exact-string pins
  // ---------------------------------------------------------------------------

  it('announcements_author_fallback is "Someone"', () => {
    expect(M3_UI_STRINGS.announcements_author_fallback).toBe("Someone");
  });

  it('crew_invite_cta is "Add to the crew"', () => {
    expect(M3_UI_STRINGS.crew_invite_cta).toBe("Add to the crew");
  });

  it('nav_account_trips_link is "Your trips"', () => {
    expect(M3_UI_STRINGS.nav_account_trips_link).toBe("Your trips");
  });

  it('nav_brand_label is "Party Trip"', () => {
    expect(M3_UI_STRINGS.nav_brand_label).toBe("Party Trip");
  });

  it('tripsList_newTrip_cta is "Start a trip"', () => {
    expect(M3_UI_STRINGS.tripsList_newTrip_cta).toBe("Start a trip");
  });

  // ---------------------------------------------------------------------------
  // Anti-pattern checks for announcements_author_fallback
  // ---------------------------------------------------------------------------

  it("announcements_author_fallback does not contain UUID fragments", () => {
    expect(M3_UI_STRINGS.announcements_author_fallback).not.toMatch(/[0-9a-f]{8}-/i);
  });

  it('announcements_author_fallback does not contain "user" (case-insensitive)', () => {
    expect(
      M3_UI_STRINGS.announcements_author_fallback.toLowerCase(),
    ).not.toContain("user");
  });

  it("announcements_author_fallback does not contain exclamation marks", () => {
    expect(M3_UI_STRINGS.announcements_author_fallback).not.toMatch(/!/);
  });

  // ---------------------------------------------------------------------------
  // "leg" jargon anti-pattern across all arrivals_* keys
  // (D3 voice rewrites ensure these pass after implementation)
  // ---------------------------------------------------------------------------

  it('no arrivals_* key value contains the word "leg" or "legs"', () => {
    for (const [key, value] of Object.entries(M3_UI_STRINGS)) {
      if (!key.startsWith("arrivals_")) continue;
      expect(
        value,
        `arrivals key "${key}" should not contain "leg"/"legs" jargon`,
      ).not.toMatch(/\bleg(s)?\b/i);
    }
  });

  // ---------------------------------------------------------------------------
  // "Dave's" name-drop anti-pattern across ALL M3 keys
  // ---------------------------------------------------------------------------

  it('no M3_UI_STRINGS value contains "Dave\'s" (organizer first-name drop)', () => {
    for (const [, value] of Object.entries(M3_UI_STRINGS)) {
      if (typeof value !== "string") continue;
      expect(value).not.toMatch(/\bDave's\b/);
    }
  });
});
