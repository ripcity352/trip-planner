/**
 * I10 — `next` is GET-navigable / client redirects are safeNext-guarded.
 *
 * THE INVARIANT: every client-side location navigation (`window.location.href =
 * X`, `location.assign(X)`, `location.replace(X)`) navigates to a safeNext()-
 * derived value, a string literal, or an allowlisted server-minted URL — never
 * a raw `?next=`. safeNext() blocks `//evil.com`, decoded schemes, backslash
 * smuggles, and rewrites the POST-only `/invite/[token]/accept` to its GET-safe
 * parent (#316/#317, #433, #106).
 *
 * safeNext() itself is exhaustively unit-tested (safe-next.test.ts); THIS gate
 * closes the other half — a NEW navigation sink that forgets to call it. The
 * two together keep every redirect target GET-navigable and same-origin.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { findNavSinks } from "./meta/next-navigation-sinks";

const SCAN_DIRS = [
  join(process.cwd(), "app"),
  join(process.cwd(), "components"),
  join(process.cwd(), "lib"),
];

describe("I10 — client navigation sinks are safeNext-guarded", () => {
  const sinks = findNavSinks(SCAN_DIRS);

  it("finds the known location sinks (scanner sanity)", () => {
    // The login form navigates via window.location on every auth success.
    expect(sinks.length).toBeGreaterThan(0);
  });

  it("every location navigation is safeNext-derived, a literal, or allowlisted", () => {
    const unguarded = sinks
      .filter((s) => s.kind === "UNGUARDED")
      .map((s) => `${s.file}:${s.line} — ${s.code} (wrap the target in safeNext())`);
    expect(unguarded, "location navigations bypassing safeNext").toEqual([]);
  });

  it("safeNext keeps its open-redirect vector coverage (unit-test guard)", () => {
    // Guard against silent erosion of the safeNext contract these sinks rely on.
    const src = readFileSync(join(process.cwd(), "tests/unit/safe-next.test.ts"), "utf8");
    for (const vector of ["//evil.com", "javascript:", "%5C", "\\\\", "/accept"]) {
      expect(src, `safe-next.test.ts must still cover ${vector}`).toContain(vector);
    }
  });
});
