/**
 * Voice-lock tests for M4 copy keys.
 *
 * These are the source of truth per Override H — every later wave reads
 * from these constants. If a string changes here, it changes everywhere.
 *
 * Tests pin:
 *   - Voice-locked headings / subheads (exact match, intentionally brittle)
 *   - Placeholder strings for chip pickers
 *   - Anti-corporate voice guards (no "error", no "An error occurred")
 */

import { describe, expect, it } from "vitest";
import { M4_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS } from "@/lib/copy/errors";

describe("M4_UI_STRINGS — voice locks", () => {
  // Exact-match pins. Changing these strings requires updating this test
  // intentionally — that friction is the point (Override H).
  it("itineraryItem_memberFlag_heading is voice-locked", () => {
    expect(M4_UI_STRINGS.itineraryItem_memberFlag_heading).toBe(
      "Anything we should know?"
    );
  });

  it("itineraryItem_memberFlag_subhead is voice-locked", () => {
    expect(M4_UI_STRINGS.itineraryItem_memberFlag_subhead).toBe(
      "Just for the organizer — private to you."
    );
  });

  it("travelLeg_airline_placeholder is voice-locked", () => {
    expect(M4_UI_STRINGS.travelLeg_airline_placeholder).toBe(
      "Type your airline"
    );
  });

  it("itineraryItem_dressCode_placeholder is voice-locked", () => {
    expect(M4_UI_STRINGS.itineraryItem_dressCode_placeholder).toBe(
      "Pick a vibe or type your own"
    );
  });

  it("itineraryItem_activityTag_placeholder is voice-locked", () => {
    expect(M4_UI_STRINGS.itineraryItem_activityTag_placeholder).toBe(
      "Add a tag"
    );
  });

  it("every M4 string is non-empty and under 120 chars", () => {
    for (const [key, value] of Object.entries(M4_UI_STRINGS)) {
      expect(typeof value, `${key} must be a string`).toBe("string");
      expect(value.trim().length, `${key} must not be empty`).toBeGreaterThan(
        0
      );
      expect(value.length, `${key} must be under 120 chars`).toBeLessThanOrEqual(120);
    }
  });
});

describe("ERRORS — anti-corporate voice guard (M4 keys)", () => {
  // Places proxy and address errors must not sound like a SaaS error modal.
  // The "would you say this at a pre-trip dinner?" test fails the moment
  // "An error occurred" or a bare "error" appears in the copy.

  it("places_proxy_failed does not contain 'error' or 'An error occurred'", () => {
    const value = ERRORS.places_proxy_failed;
    expect(value.toLowerCase()).not.toContain("an error occurred");
    expect(value.toLowerCase()).not.toContain("error");
  });

  it("address_lookup_failed does not contain 'error' or 'An error occurred'", () => {
    const value = ERRORS.address_lookup_failed;
    expect(value.toLowerCase()).not.toContain("an error occurred");
    expect(value.toLowerCase()).not.toContain("error");
  });

  it("places_proxy_failed has a non-empty string", () => {
    expect(ERRORS.places_proxy_failed.trim().length).toBeGreaterThan(0);
  });

  it("address_lookup_failed has a non-empty string", () => {
    expect(ERRORS.address_lookup_failed.trim().length).toBeGreaterThan(0);
  });

  it("datetime_invalid has a non-empty string", () => {
    expect(ERRORS.datetime_invalid.trim().length).toBeGreaterThan(0);
  });
});
