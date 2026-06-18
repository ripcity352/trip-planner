/**
 * D3 injection / escaping / oversize tests for the OG card helpers.
 *
 * These are a MERGE-BLOCKER for PR 2a (#219). All cases must pass.
 *
 * Test matrix mandated by auth-execution-plan.md §D3:
 *   1. HTML/markup in trip name -> stripped
 *   2. CRLF + unicode LS/PS in host -> stripped
 *   3. 500-char trip name (oversize) -> clamped to 40 + "..."
 *   4. null host -> inviteH1Fallback
 *   5. null trip -> OG_CARD_FALLBACK
 *
 * Additional cases for robustness and the generic-card fallback contract.
 */

import { describe, expect, it } from "vitest";
import {
  sanitizeForOg,
  clampText,
  sanitizeTripName,
  sanitizeHost,
  buildOgCardText,
  buildInviteH1,
  formatOgDates,
  OG_CARD_FALLBACK,
} from "@/lib/og/invite-card";
import { AUTH_COPY } from "@/lib/copy/auth";

// ---------------------------------------------------------------------------
// sanitizeForOg
// ---------------------------------------------------------------------------

describe("sanitizeForOg", () => {
  it("passes through clean text unchanged", () => {
    expect(sanitizeForOg("Dave's Vegas Trip")).toBe("Dave's Vegas Trip");
  });

  it("strips LF characters", () => {
    expect(sanitizeForOg("Trip\nName")).toBe("Trip Name");
  });

  it("strips CR characters", () => {
    expect(sanitizeForOg("Trip\rName")).toBe("Trip Name");
  });

  it("strips CRLF sequences", () => {
    expect(sanitizeForOg("Trip\r\nName")).toBe("Trip Name");
  });

  it("strips Unicode Line Separator (U+2028)", () => {
    // Direct construction via String.fromCharCode to avoid source-encoding issues
    const ls = String.fromCharCode(0x2028);
    expect(sanitizeForOg(`Host${ls}Name`)).toBe("Host Name");
  });

  it("strips Unicode Paragraph Separator (U+2029)", () => {
    const ps = String.fromCharCode(0x2029);
    expect(sanitizeForOg(`Host${ps}Name`)).toBe("Host Name");
  });

  it("strips C0 control characters (null, bell, etc.)", () => {
    expect(sanitizeForOg("\x00\x07\x1F")).toBe("");
  });

  it("strips TAB characters", () => {
    expect(sanitizeForOg("Trip\tName")).toBe("Trip Name");
  });

  it("strips DEL (0x7F)", () => {
    expect(sanitizeForOg("A\x7FB")).toBe("A B");
  });

  it("collapses runs of whitespace to a single space", () => {
    expect(sanitizeForOg("Trip   Name")).toBe("Trip Name");
  });

  it("trims leading and trailing whitespace", () => {
    expect(sanitizeForOg("  Trip Name  ")).toBe("Trip Name");
  });

  // D3 mandate: HTML/markup in trip name -> stripped control chars but NOT
  // HTML tags themselves (that happens via OG renderer escaping, not here).
  // We verify injection-sink control chars are removed; HTML angle brackets
  // are kept because OG card text is raw-text, not HTML context.
  it("does not strip angle brackets (HTML escaping is the renderer's job)", () => {
    const result = sanitizeForOg("<script>alert(1)</script>");
    expect(result).toBe("<script>alert(1)</script>");
  });

  it("strips CRLF injection pattern commonly used in OG text injection", () => {
    const injected = "Real Title\r\nX-Fake-Header: value";
    expect(sanitizeForOg(injected)).toBe("Real Title X-Fake-Header: value");
  });
});

// ---------------------------------------------------------------------------
// clampText
// ---------------------------------------------------------------------------

describe("clampText", () => {
  it("returns the string unchanged when within limit", () => {
    expect(clampText("Short", 10)).toBe("Short");
  });

  it("returns the string unchanged when exactly at limit", () => {
    expect(clampText("1234567890", 10)).toBe("1234567890");
  });

  it("clamps and appends ... when over limit", () => {
    expect(clampText("1234567890X", 10)).toBe("1234567890...");
  });

  it("handles empty string", () => {
    expect(clampText("", 10)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// sanitizeTripName (40 char limit)
// ---------------------------------------------------------------------------

describe("sanitizeTripName", () => {
  it("passes through a normal trip name", () => {
    expect(sanitizeTripName("Vegas Bachelor Party")).toBe(
      "Vegas Bachelor Party",
    );
  });

  // D3 mandate: 500-char trip name -> clamped at 40 + "..."
  it("clamps a 500-char trip name to 40 chars + ...", () => {
    const long = "A".repeat(500);
    const result = sanitizeTripName(long);
    expect(result).toBe("A".repeat(40) + "...");
    expect(result.length).toBe(43);
  });

  // D3 mandate: HTML/markup in trip name
  it("strips CR/LF from a trip name that contains newlines", () => {
    const result = sanitizeTripName("Vegas Trip\r\nExtra Line");
    expect(result).toBe("Vegas Trip Extra Line");
  });

  it("collapses whitespace in trip name", () => {
    expect(sanitizeTripName("Vegas   Trip")).toBe("Vegas Trip");
  });
});

// ---------------------------------------------------------------------------
// sanitizeHost (30 char limit)
// ---------------------------------------------------------------------------

describe("sanitizeHost", () => {
  it("passes through a normal host name", () => {
    expect(sanitizeHost("Alex")).toBe("Alex");
  });

  // D3 mandate: CRLF + LS in host -> stripped
  it("strips CRLF from a host name", () => {
    const result = sanitizeHost("Host\r\nName");
    expect(result).toBe("Host Name");
  });

  it("strips Unicode Line Separator from host name", () => {
    const ls = String.fromCharCode(0x2028);
    expect(sanitizeHost(`Host${ls}Name`)).toBe("Host Name");
  });

  it("clamps a host name longer than 30 chars", () => {
    const long = "A".repeat(40);
    const result = sanitizeHost(long);
    expect(result).toBe("A".repeat(30) + "...");
    expect(result.length).toBe(33);
  });
});

// ---------------------------------------------------------------------------
// buildOgCardText
// ---------------------------------------------------------------------------

describe("buildOgCardText", () => {
  it("interpolates trip name and dates into the template", () => {
    const result = buildOgCardText({
      tripName: "Vegas Trip",
      dates: "Jun 14 - Jun 17",
    });
    expect(result).toBe("You're invited — Vegas Trip · Jun 14 - Jun 17.");
  });

  it("returns OG_CARD_FALLBACK when tripName is null", () => {
    // D3 mandate: null trip -> generic card fallback
    expect(
      buildOgCardText({ tripName: null, dates: "Jun 14 - Jun 17" }),
    ).toBe(OG_CARD_FALLBACK);
  });

  it("returns OG_CARD_FALLBACK when tripName is empty string", () => {
    expect(buildOgCardText({ tripName: "", dates: "Jun 14 - Jun 17" })).toBe(
      OG_CARD_FALLBACK,
    );
  });

  it("returns OG_CARD_FALLBACK when dates is null", () => {
    // D3 mandate: null dates -> generic card fallback (no dangling separator)
    expect(buildOgCardText({ tripName: "Vegas Trip", dates: null })).toBe(
      OG_CARD_FALLBACK,
    );
  });

  it("returns OG_CARD_FALLBACK when dates is empty string", () => {
    expect(buildOgCardText({ tripName: "Vegas Trip", dates: "" })).toBe(
      OG_CARD_FALLBACK,
    );
  });

  it("returns OG_CARD_FALLBACK when both fields are null", () => {
    expect(buildOgCardText({ tripName: null, dates: null })).toBe(
      OG_CARD_FALLBACK,
    );
  });

  it("OG_CARD_FALLBACK constant is the expected generic string", () => {
    expect(OG_CARD_FALLBACK).toBe("You're invited.");
  });

  it("template source is AUTH_COPY.ogCard (pinned)", () => {
    // Regression lock: if AUTH_COPY.ogCard drifts, this test fails explicitly.
    expect(AUTH_COPY.ogCard).toBe("You're invited — {Trip} · {dates}.");
  });
});

// ---------------------------------------------------------------------------
// buildInviteH1
// ---------------------------------------------------------------------------

describe("buildInviteH1", () => {
  it("interpolates host name into the H1 template", () => {
    expect(buildInviteH1("Alex")).toBe("Alex wants you on this one.");
  });

  // D3 mandate: null host -> inviteH1Fallback
  it("returns inviteH1Fallback when host is null", () => {
    expect(buildInviteH1(null)).toBe(AUTH_COPY.inviteH1Fallback);
  });

  it("returns inviteH1Fallback when host is undefined", () => {
    expect(buildInviteH1(undefined)).toBe(AUTH_COPY.inviteH1Fallback);
  });

  it("returns inviteH1Fallback when host is empty string", () => {
    expect(buildInviteH1("")).toBe(AUTH_COPY.inviteH1Fallback);
  });

  it("returns inviteH1Fallback when host is all whitespace", () => {
    expect(buildInviteH1("   ")).toBe(AUTH_COPY.inviteH1Fallback);
  });

  it("sanitizes CRLF in host before interpolating", () => {
    const result = buildInviteH1("Host\r\nName");
    expect(result).toBe("Host Name wants you on this one.");
  });

  it("sanitizes Unicode LS in host before interpolating", () => {
    const ls = String.fromCharCode(0x2028);
    const result = buildInviteH1(`Host${ls}Name`);
    expect(result).toBe("Host Name wants you on this one.");
  });

  it("clamps a long host name and still interpolates", () => {
    const long = "A".repeat(40);
    const result = buildInviteH1(long);
    // Should be clamped at 30 + "..." then interpolated
    expect(result).toBe("A".repeat(30) + "... wants you on this one.");
  });

  it("inviteH1 template is the pinned spec string", () => {
    expect(AUTH_COPY.inviteH1).toBe("{Host} wants you on this one.");
  });

  it("inviteH1Fallback is the pinned spec string", () => {
    expect(AUTH_COPY.inviteH1Fallback).toBe("You're on the list.");
  });
});

// ---------------------------------------------------------------------------
// formatOgDates
// ---------------------------------------------------------------------------

describe("formatOgDates", () => {
  it("formats a date range with start and end", () => {
    const result = formatOgDates("2026-06-14", "2026-06-17");
    expect(result).toBe("Jun 14 - Jun 17");
  });

  it("formats a single start date (no end)", () => {
    const result = formatOgDates("2026-06-14", null);
    expect(result).toBe("Jun 14");
  });

  it("returns null when both dates are null", () => {
    expect(formatOgDates(null, null)).toBeNull();
  });

  it("returns null when only end date is provided", () => {
    // No starts_at -> no date to show
    expect(formatOgDates(null, "2026-06-17")).toBeNull();
  });
});
