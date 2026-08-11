/**
 * I6 — No roster-member email rendered as a display name (PII-leak gate).
 *
 * THE INVARIANT: names in shared trip UI route through the display helpers
 * (`resolveMemberName` / `useDisplayName` / `<Identifier>`), never through a
 * raw `.email`. An email is PII and — worse — an *unstable identity leak*: it
 * exposes a co-member's login address to everyone who can see the surface.
 * The canonical miss is the copy-paste `member.display_name ?? member.email`
 * fallback chain (roster Guest-wall; W1a author/roster fallback split).
 *
 * THE TELL: in `components/**` (the shared surface that renders OTHER members)
 * a `.email` appears on the right of a `??` — i.e. used as a display fallback
 * value. The viewer's OWN email on their own identity surfaces
 * (`app/(authed)/trips/[tripId]/me`, `.../account/**` — `user.email` from the
 * auth session) is legitimate and deliberately OUT of this scan's scope: those
 * pages exist to show you your own login email.
 *
 * THE CHECKER (this file): a scan gate mirroring no-local-part-audit.test.ts
 * (#216). Two halves: the detector fires on known-bad fixtures (a green scan
 * can't be a vacuous regex), and the components/ scan returns zero after a
 * single documented allowlist entry.
 *
 * SIBLING GATES already covering the rest of the invariant:
 *   - `.split("@")[0]` local-part derivation → no-local-part-audit.test.ts.
 *   - raw UUID in JSX text → eslint anti-tell rule (c) (eslint-anti-tells).
 *   - realtime announcement author enrichment → the map-hit/miss/"Someone"
 *     assertions in lib/db/__tests__/announcements.test.ts (the realtime
 *     INSERT path resolves via memberUserMap, never email/uuid).
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const WORKTREE = resolve(__dirname, "../..");

/**
 * Shared trip-UI components — the surface that renders members OTHER than the
 * viewer. Own-identity email surfaces (me / account pages) live in
 * app/(authed)/ and are intentionally excluded (see file header).
 */
const SCAN_ROOTS = ["components"] as const;
const SCAN_EXTENSIONS = [".ts", ".tsx"] as const;

/**
 * `.email` used as a nullish-coalescing display fallback: `<expr> ?? …x.email`.
 * Matches the PII-as-name pattern (`display_name ?? m.email`) and NOT:
 *   - form-field wiring (`errors.email ? …` — a ternary, not `??`),
 *   - own-email defaulting (`user.email ?? ""` — email on the LEFT of `??`),
 *   - `deriveInitial(name, user.email)` (a call arg, no `??`).
 * A tell-detector, not a semantic gate; the #186 PR-template check backstops.
 */
const EMAIL_AS_FALLBACK = /\?\?\s*[^;\n]*\.email\b/;

/**
 * Deliberate, documented exceptions — each an organizer-only surface where a
 * member email is a disambiguator, not a public display, and no helper fits.
 * Keyed by repo-relative path. Keep SMALL; every entry is a reviewed leak.
 */
const ALLOWLIST: Record<string, string> = {
  // Organizer-only lodging assign <select>. <option> is text-only, so
  // <Identifier> can't render there; the email fallback stops two unnamed
  // members both collapsing to an identical "Guest" option. Documented inline
  // at the call site. Follow-up: de-PII the picker (operator-gated).
  "components/trip/itinerary/lodging-roster.tsx":
    "organizer-only assign picker; text-only <option>; disambiguates unnamed members",
};

interface Violation {
  file: string;
  line: number;
  text: string;
}

function walkSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") return []; // fixtures may quote the tell
      return walkSourceFiles(full);
    }
    return SCAN_EXTENSIONS.some((ext) => entry.name.endsWith(ext)) ? [full] : [];
  });
}

function findViolations(): Violation[] {
  return SCAN_ROOTS.flatMap((root) =>
    walkSourceFiles(join(WORKTREE, root)).flatMap((file) => {
      const rel = relative(WORKTREE, file);
      if (rel in ALLOWLIST) return [];
      return readFileSync(file, "utf8")
        .split("\n")
        .flatMap((text, i) =>
          EMAIL_AS_FALLBACK.test(text)
            ? [{ file: rel, line: i + 1, text: text.trim() }]
            : [],
        );
    }),
  );
}

describe("detector self-proof: fires on known-bad fixtures", () => {
  it.each([
    "const name = member.display_name ?? member.email ?? fallback;",
    "return <span>{m.display_name ?? m.email}</span>;",
    "const label = display_name ?? user.email;",
  ])("detects %s", (badLine) => {
    expect(EMAIL_AS_FALLBACK.test(badLine)).toBe(true);
  });

  it("does not fire on legitimate email usage", () => {
    expect(EMAIL_AS_FALLBACK.test('const email = user.email ?? "";')).toBe(false);
    expect(EMAIL_AS_FALLBACK.test('aria-invalid={errors.email ? "true" : undefined}')).toBe(false);
    expect(EMAIL_AS_FALLBACK.test("deriveInitial(name, user.email)")).toBe(false);
    expect(EMAIL_AS_FALLBACK.test('setValue("email", values.email)')).toBe(false);
  });
});

describe("repo audit: no member email rendered as a display name", () => {
  it("keeps the allowlist minimal and every entry still exists", () => {
    for (const rel of Object.keys(ALLOWLIST)) {
      expect(
        readFileSync(join(WORKTREE, rel), "utf8"),
        `${rel} must still contain the allowlisted email fallback`,
      ).toMatch(EMAIL_AS_FALLBACK);
    }
    expect(Object.keys(ALLOWLIST).length).toBeLessThanOrEqual(2);
  });

  it("finds zero `?? …email` display-fallbacks in components/", () => {
    const violations = findViolations();
    expect(
      violations,
      `Rendering a member .email as a display name is banned (I6 — use ` +
        `resolveMemberName / useDisplayName / <Identifier>):\n` +
        violations.map((v) => `  ${v.file}:${v.line}  ${v.text}`).join("\n"),
    ).toEqual([]);
  });
});
