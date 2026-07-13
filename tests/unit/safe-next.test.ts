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

  // Backslash open-redirect (PR #437 security review, MEDIUM): browsers
  // normalize `\` to `/` when resolving relative URLs, so
  // new URL("/\\evil.com", origin) lands on https://evil.com/ — a
  // post-auth open redirect through `window.location.href = next`.
  describe("backslash rejection (protocol-relative in disguise)", () => {
    it("rejects /\\evil.com (backslash after slash)", () => {
      expect(safeNext("/\\evil.com")).toBe("/trips");
    });

    it("rejects the percent-encoded smuggle /%5Cevil.com", () => {
      expect(safeNext("/%5Cevil.com")).toBe("/trips");
    });

    it("rejects \\\\evil.com (leading backslashes)", () => {
      expect(safeNext("\\\\evil.com")).toBe("/trips");
    });

    it("rejects a backslash buried mid-path", () => {
      expect(safeNext("/trips/abc\\evil.com")).toBe("/trips");
    });

    it("still passes an ordinary backslash-free path", () => {
      expect(safeNext("/trips/abc?tab=crew")).toBe("/trips/abc?tab=crew");
    });
  });

  // #433: `next` targets are consumed by GET redirects, but
  // /invite/<token>/accept is POST-only — a GET there dead-ends in a 405
  // (flagged LOW in the #430 security review). safeNext rewrites the shape
  // to its GET-safe parent (the invite preview).
  describe("POST-only invite-accept rewrite (#433)", () => {
    it("rewrites /invite/<token>/accept to the GET-safe preview parent", () => {
      expect(safeNext("/invite/tok123/accept")).toBe("/invite/tok123");
    });

    it("rewrites the trailing-slash variant", () => {
      expect(safeNext("/invite/tok123/accept/")).toBe("/invite/tok123");
    });

    it("preserves a query string across the rewrite", () => {
      expect(safeNext("/invite/tok123/accept?from=email")).toBe(
        "/invite/tok123?from=email",
      );
    });

    it("leaves the invite preview path itself unchanged", () => {
      expect(safeNext("/invite/tok123")).toBe("/invite/tok123");
    });

    it("leaves deeper non-terminal /accept/ segments unchanged", () => {
      // Only the exact POST-only shape is rewritten — anything else is
      // an ordinary same-origin path and passes through.
      expect(safeNext("/invite/tok123/accept/extra")).toBe(
        "/invite/tok123/accept/extra",
      );
    });
  });
});
