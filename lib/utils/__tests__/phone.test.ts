/**
 * Tests for the lenient E.164 normalizer (#368). The contract: lenient
 * on input decoration, strict on output — always `+<digits>` or null.
 */

import { describe, expect, it } from "vitest";

import { normalizePhoneE164 } from "../phone";

describe("normalizePhoneE164", () => {
  it("passes a clean E.164 number through unchanged", () => {
    expect(normalizePhoneE164("+14155551212")).toBe("+14155551212");
    expect(normalizePhoneE164("+442079460958")).toBe("+442079460958");
  });

  it("strips human decoration — spaces, dashes, dots, parens", () => {
    expect(normalizePhoneE164("(415) 555-1212")).toBe("+14155551212");
    expect(normalizePhoneE164("415.555.1212")).toBe("+14155551212");
    expect(normalizePhoneE164("+44 20 7946 0958")).toBe("+442079460958");
    expect(normalizePhoneE164("  +1 415-555-1212  ")).toBe("+14155551212");
  });

  it("assumes US for bare 10-digit numbers", () => {
    expect(normalizePhoneE164("4155551212")).toBe("+14155551212");
  });

  it("accepts 11 digits already led by the US country code", () => {
    expect(normalizePhoneE164("14155551212")).toBe("+14155551212");
  });

  it("treats the 00 international prefix as +", () => {
    expect(normalizePhoneE164("0044 20 7946 0958")).toBe("+442079460958");
  });

  it("returns null for empty or whitespace input", () => {
    expect(normalizePhoneE164("")).toBeNull();
    expect(normalizePhoneE164("   ")).toBeNull();
  });

  it("rejects letters, short codes, and un-shapeable digit runs", () => {
    expect(normalizePhoneE164("call me maybe")).toBeNull();
    expect(normalizePhoneE164("911")).toBeNull();
    expect(normalizePhoneE164("555-1212")).toBeNull(); // 7 digits, no area code
    expect(normalizePhoneE164("+0123456789")).toBeNull(); // leading zero
    expect(normalizePhoneE164("+123456789012345678")).toBeNull(); // >15 digits
    // 10 digits but not a valid US area code (leading 1) and not 11-digit.
    expect(normalizePhoneE164("1155551212")).toBeNull();
  });

  it("rejects 11-digit numbers whose remainder is not a US number", () => {
    // Leads with 1 but the area code then starts with 0 — not dialable.
    expect(normalizePhoneE164("10155551212")).toBeNull();
  });
});
