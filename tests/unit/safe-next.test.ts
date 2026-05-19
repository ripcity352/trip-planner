/**
 * Tests for `safeNext()` — the same-origin redirect normalizer used by
 * `/auth/callback`.
 *
 * Each case below was a real open-redirect / XSS variant on the
 * pre-hardening code. We pin them as regressions so a future refactor
 * that "simplifies" the helper can't silently re-introduce them.
 */

import { describe, expect, it } from "vitest";

import { safeNext } from "@/lib/auth/safe-next";

describe("safeNext()", () => {
  it("returns the default when input is null", () => {
    expect(safeNext(null)).toBe("/trips");
  });

  it("returns the default when input is empty", () => {
    expect(safeNext("")).toBe("/trips");
  });

  it("returns same-origin paths unchanged", () => {
    expect(safeNext("/trips/abc")).toBe("/trips/abc");
  });

  it("preserves query strings on same-origin paths", () => {
    expect(safeNext("/trips?q=1")).toBe("/trips?q=1");
  });

  it("rejects protocol-relative URLs (//evil.com/x)", () => {
    // The single load-bearing case: //evil.com is the open-redirect
    // vector that motivated this helper.
    expect(safeNext("//evil.com/x")).toBe("/trips");
  });

  it("rejects absolute https:// URLs", () => {
    expect(safeNext("https://evil.com")).toBe("/trips");
  });

  it("rejects javascript: scheme", () => {
    expect(safeNext("javascript:alert(1)")).toBe("/trips");
  });

  it("rejects data: scheme", () => {
    expect(safeNext("data:text/html,<script>alert(1)</script>")).toBe(
      "/trips"
    );
  });

  it("rejects input that doesn't start with /", () => {
    expect(safeNext("trips")).toBe("/trips");
  });

  it("rejects scheme-only input (no leading slash)", () => {
    // Defense-in-depth: the leading-slash check already catches this,
    // but the decoded-form scheme check is the second line of defense.
    expect(safeNext("javascript:alert(1)")).toBe("/trips");
  });

  it("handles malformed percent-encoding by failing closed", () => {
    expect(safeNext("/%E0%A4%A")).toBe("/trips");
  });
});
