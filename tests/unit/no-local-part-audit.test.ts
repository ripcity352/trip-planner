/**
 * Proof: no email-local-part display derivation (#216 audit).
 *
 * The design system forbids deriving a display name from an email
 * local-part (`user@x.com` → "user") anywhere in production code — the
 * single resolution path is `resolveMemberName` via `useDisplayName`.
 * This was a manual Wave-2 gate (`grep -rn '\.split("@")\[0\]' lib/
 * components/ app/`); promoting it into the vitest suite makes it run on
 * every PR. DS-closure ADR carry-forward.
 *
 * Two halves, mirroring eslint-anti-tells.test.ts:
 *  1. the detector fires on known-bad fixtures (so a green scan can't be
 *     a vacuous regex), and
 *  2. the scan over lib/ components/ app/ returns zero hits.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

// Worktree root — scan roots are resolved relative to here.
const WORKTREE = resolve(__dirname, "../..");

// Same scope as the documented #216 audit grep: production source roots.
// tests/ is excluded — fixtures there (including this file) may quote the
// banned pattern.
const SCAN_ROOTS = ["lib", "components", "app"] as const;

const SCAN_EXTENSIONS = [".ts", ".tsx"] as const;

// `.split("@")[0]` with any quote style and incidental whitespace.
// Scope-faithful to the grep it replaces: the `[0]`-index form only.
// Equivalent derivations (`.at(0)`, `?.[0]`, destructuring, indexOf
// slicing) are NOT caught — this is a tell-detector, not a complete
// semantic gate; the #186 PR-template human check is the backstop.
const LOCAL_PART_DERIVATION = /\.split\((["'`])@\1\)\s*\[\s*0\s*\]/;

interface Violation {
  file: string;
  line: number;
  text: string;
}

function walkSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walkSourceFiles(full);
    return SCAN_EXTENSIONS.some((ext) => entry.name.endsWith(ext))
      ? [full]
      : [];
  });
}

function findViolations(): Violation[] {
  return SCAN_ROOTS.flatMap((root) =>
    walkSourceFiles(join(WORKTREE, root)).flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .flatMap((text, i) =>
          LOCAL_PART_DERIVATION.test(text)
            ? [{ file: relative(WORKTREE, file), line: i + 1, text: text.trim() }]
            : [],
        ),
    ),
  );
}

describe("detector self-proof: fires on known-bad fixtures", () => {
  it.each([
    ['const name = email.split("@")[0];', "double quotes"],
    ["const name = email.split('@')[0];", "single quotes"],
    ["const name = email.split(`@`)[0];", "backticks"],
    ['const name = user.email.split("@") [0];', "whitespace before index"],
  ])("detects %s (%s)", (badLine, _label) => {
    expect(LOCAL_PART_DERIVATION.test(badLine)).toBe(true);
  });

  it("does not fire on legitimate split calls", () => {
    expect(LOCAL_PART_DERIVATION.test('path.split("/")[0]')).toBe(false);
    expect(LOCAL_PART_DERIVATION.test('email.split("@")[1]')).toBe(false);
  });
});

describe("repo audit: no email-local-part display derivation", () => {
  it("finds zero `.split(\"@\")[0]` hits in lib/, components/, app/", () => {
    const violations = findViolations();
    expect(
      violations,
      `Email-local-part display derivation is banned (#216 — use ` +
        `useDisplayName / resolveMemberName instead):\n` +
        violations.map((v) => `  ${v.file}:${v.line}  ${v.text}`).join("\n"),
    ).toEqual([]);
  });
});
