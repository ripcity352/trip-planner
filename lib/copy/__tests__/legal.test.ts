/**
 * Voice-lock tests for legal copy palette.
 *
 * Negative assertions guard against corporate boilerplate creeping in.
 * Positive assertions pin the exact strings so accidental rewrites fail loudly.
 *
 * Voice rule: "would you say this at a pre-trip dinner?"
 * Warm, plainspoken, brief — never corporate, never legalese.
 */

import { describe, expect, it } from "vitest";
import { LEGAL_COPY } from "@/lib/copy/legal";

// ---------------------------------------------------------------------------
// Structural sanity — every key must be a non-empty string
// ---------------------------------------------------------------------------
describe("LEGAL_COPY — structural sanity", () => {
  it("every key is a non-empty string under 200 chars", () => {
    for (const [key, value] of Object.entries(LEGAL_COPY)) {
      expect(typeof value, `${key} must be a string`).toBe("string");
      expect(value.trim().length, `${key} must not be empty`).toBeGreaterThan(0);
      expect(value.length, `${key} must be under 200 chars`).toBeLessThanOrEqual(200);
    }
  });

  it("exposes all required terms keys", () => {
    const required: Array<keyof typeof LEGAL_COPY> = [
      "terms_heading",
      "terms_intro",
      "terms_what_section_heading",
      "terms_what_body",
      "terms_data_section_heading",
      "terms_data_body",
      "terms_contact_section_heading",
      "terms_contact_body",
    ];
    for (const key of required) {
      expect(LEGAL_COPY[key], `${key} must exist`).toBeDefined();
    }
  });

  it("exposes all required privacy keys", () => {
    const required: Array<keyof typeof LEGAL_COPY> = [
      "privacy_heading",
      "privacy_intro",
      "privacy_what_section_heading",
      "privacy_what_body",
      "privacy_share_section_heading",
      "privacy_share_body",
      "privacy_delete_section_heading",
      "privacy_delete_body",
    ];
    for (const key of required) {
      expect(LEGAL_COPY[key], `${key} must exist`).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Anti-corporate voice guards — negative assertions
// ---------------------------------------------------------------------------
describe("LEGAL_COPY — anti-corporate voice guards", () => {
  const allValues = () => Object.values(LEGAL_COPY);

  it('no string contains "BY USING THIS" (corporate uppercase boilerplate)', () => {
    for (const value of allValues()) {
      expect(value).not.toContain("BY USING THIS");
    }
  });

  it('no string contains "hereinafter" (legalese)', () => {
    for (const value of allValues()) {
      expect(value.toLowerCase()).not.toContain("hereinafter");
    }
  });

  it('no string contains "acknowledge and agree" (corporate boilerplate)', () => {
    for (const value of allValues()) {
      expect(value.toLowerCase()).not.toContain("acknowledge and agree");
    }
  });

  it('no string contains "the Service" (corporate SaaS pattern)', () => {
    for (const value of allValues()) {
      expect(value).not.toContain("the Service");
    }
  });

  it('no string contains "herein" (legalese)', () => {
    for (const value of allValues()) {
      expect(value.toLowerCase()).not.toContain("herein");
    }
  });

  it('no string contains "pursuant to" (legalese)', () => {
    for (const value of allValues()) {
      expect(value.toLowerCase()).not.toContain("pursuant to");
    }
  });
});

// ---------------------------------------------------------------------------
// Exact voice-locked snapshot pins
// ---------------------------------------------------------------------------
describe("LEGAL_COPY — voice-locked snapshot pins", () => {
  it("terms_heading is voice-locked", () => {
    expect(LEGAL_COPY.terms_heading).toBe("The terms");
  });

  it("terms_intro is voice-locked", () => {
    expect(LEGAL_COPY.terms_intro).toBe(
      "Quick version: this is a planning tool for one party. Don't use it to harass anyone. Be kind."
    );
  });

  it("privacy_heading is voice-locked", () => {
    expect(LEGAL_COPY.privacy_heading).toBe("What we keep");
  });

  it("privacy_intro is voice-locked", () => {
    expect(LEGAL_COPY.privacy_intro).toBe(
      "Just enough to run the app. No more."
    );
  });

  it("privacy_share_body is voice-locked", () => {
    expect(LEGAL_COPY.privacy_share_body).toBe(
      "We don't share your data with anyone. Not now, not later."
    );
  });
});

// ---------------------------------------------------------------------------
// No HTML in copy strings — plain text only
// ---------------------------------------------------------------------------
describe("LEGAL_COPY — no HTML in copy strings", () => {
  it("no string contains raw HTML tags", () => {
    const htmlTagPattern = /<[a-z][\s\S]*?>/i;
    for (const [key, value] of Object.entries(LEGAL_COPY)) {
      expect(
        htmlTagPattern.test(value),
        `${key} must not contain HTML tags`
      ).toBe(false);
    }
  });
});
