/**
 * I5 — SECURITY DEFINER anon-revoke invariant (anon-oracle regression gate).
 *
 * THE INVARIANT: every `SECURITY DEFINER` function in `public` that PostgREST
 * can expose as an RPC (returns non-`trigger`) must REVOKE EXECUTE from
 * `anon` / `public` — otherwise it is an anonymous oracle running with the
 * function owner's rights (project_security_definer_anon_oracle; #422).
 *
 * TWO EXEMPTIONS, both principled (validated by the I5 security review):
 *  - Trigger functions (RETURNS trigger) — PostgREST never exposes them.
 *  - RLS-policy helpers — a function referenced in any `CREATE POLICY`
 *    USING/WITH CHECK expression MUST keep anon EXECUTE. PostgreSQL checks
 *    EXECUTE against the *querying* role at call time even for a DEFINER
 *    function spliced into a policy, so revoking anon would make anon queries
 *    error ("permission denied for function") instead of returning empty — a
 *    regression, not a hardening. This exemption is DERIVED from the migration
 *    source (functionsReferencedInPolicies), not hand-maintained.
 *  - One intentional anon RPC: `invite_preview` (the anon invite-preview page,
 *    #219/#367 — a token-gated, minimized disclosure contract).
 *
 * THE CHECKER (static migration scan): CI-runnable, and immune to the local
 * grant-repair that re-grants anon after `db reset` (feedback_grant_repair_vs
 * _revokes). Fixed on this PR: `accept_invite` + `create_trip_with_organizer`
 * (RPC, authenticated-only, previously anon-callable) now revoke anon+public.
 */

import { describe, it, expect } from "vitest";
import { join } from "node:path";

import {
  extractSecDefFunctions,
  functionsReferencedInPolicies,
} from "./meta/migration-secdef";

const MIGRATIONS_DIR = join(process.cwd(), "supabase/migrations");

/**
 * Functions intentionally left anon-callable, with the reason each is safe.
 * Keep this SMALL — every entry is an anon-reachable DEFINER surface.
 */
const INTENTIONAL_ANON_ALLOWLIST: Record<string, string> = {
  // Anon invite-preview page (#219/#367): token-gated, returns a minimized,
  // frozen disclosure contract (bucketed attendee count, no PII). Adding a
  // column here widens an anon oracle — see the function comment.
  invite_preview: "anon invite-preview by design (token-gated, minimized)",
};

const funcs = extractSecDefFunctions(MIGRATIONS_DIR);
const policyRefs = functionsReferencedInPolicies(MIGRATIONS_DIR);

function violations() {
  return funcs.filter(
    (f) =>
      f.securityDefiner &&
      !f.returnsTrigger &&
      !f.hasAnonRevoke &&
      !policyRefs.has(f.name) &&
      !(f.name in INTENTIONAL_ANON_ALLOWLIST),
  );
}

describe("I5 — SECURITY DEFINER anon-revoke", () => {
  it("finds SECURITY DEFINER functions (scanner sanity)", () => {
    expect(funcs.some((f) => f.securityDefiner)).toBe(true);
    expect(policyRefs.size).toBeGreaterThan(0);
  });

  it("every anon-exposable SECURITY DEFINER function revokes anon (or is exempt)", () => {
    const offenders = violations().map(
      (f) =>
        `public.${f.name} (${f.defFiles.join(", ")}) — SECURITY DEFINER, PostgREST-exposable, no anon revoke, not an RLS-policy helper`,
    );
    expect(offenders, "anon-callable SECURITY DEFINER oracles").toEqual([]);
  });

  it("the intentional-anon allowlist stays minimal and every entry still exists", () => {
    // Guard against a stale allowlist: an entry that no longer names a real
    // SECURITY DEFINER function is dead weight and should be removed.
    for (const name of Object.keys(INTENTIONAL_ANON_ALLOWLIST)) {
      const f = funcs.find((x) => x.name === name);
      expect(f?.securityDefiner, `${name} must be a real SECURITY DEFINER fn`).toBe(true);
    }
    expect(Object.keys(INTENTIONAL_ANON_ALLOWLIST).length).toBeLessThanOrEqual(2);
  });
});
