/**
 * I3 — Deterministic-vs-transient error split (#474 regression gate).
 *
 * THE INVARIANT: every mutation server action distinguishes a *coded*
 * Postgres/PostgREST failure (unique-violation, RLS-denied, trigger raise —
 * a retry can NEVER fix these) from a *codeless* transport failure (fetch
 * reject / timeout — a retry MIGHT fix). Coded → a deterministic errorKey
 * (`rls_denied`, `validation_failed`, or a feature-specific reject); codeless
 * → a retry-framed `*_failed` / `network` / `rate_limit` key. Collapsing every
 * coded error into a retry key loops the user forever on an unfixable failure.
 *
 * THE TELL: a mutation action (returns `{ ok: false; errorKey }` AND touches
 * the DB) that inspects `error.code` NOWHERE — neither in-file nor in any
 * `@/lib/db` module it imports. Such an action can only ever return a retry
 * key from its catch block, which is the #474 collapse.
 *
 * THE CHECKER (this file): a LISTING meta-test. It classifies every
 * `lib/actions/*.ts` mutation action as split / collapse (crediting coded
 * classification done in the imported db layer — `profile.ts` / `members.ts`
 * delegate their 23505 handling to `updateMyMemberProfile`), then asserts the
 * collapse set is empty (⊆ a documented allowlist). Ships as a permanent gate:
 * a NEW action that forgets the split fails here, not in a mid-trip retry loop.
 *
 * WHY A LISTING GATE, NOT A PRECISE ONE: proving a *specific* coded branch
 * routes to a deterministic key requires whole-program dataflow. This gate
 * instead locks the coarse, mechanical property — "the action inspects error
 * codes SOMEWHERE on its write path" — which is exactly what a collapsing
 * action lacks. The current baseline is clean (0 collapsers); the gate keeps
 * it that way. Prior: #474; audit P1#9.
 */

import { describe, it, expect } from "vitest";

import {
  extractActionErrorProfiles,
  performsSplit,
  DIRS,
} from "./meta/action-error-split";

/**
 * Mutation actions intentionally exempt from the coded/codeless split, each
 * with the reason it can never hit a coded DB error on its write path. Keep
 * this SMALL and justified — an unexplained entry is a hidden retry-loop.
 * Empty today: every mutation action classifies error codes in-file or via
 * its db layer.
 */
const COLLAPSE_ALLOWLIST: Record<string, string> = {};

const profiles = extractActionErrorProfiles(DIRS.actions(), DIRS.db());
const mutationActions = profiles.filter((p) => p.isMutationAction);

describe("I3 — deterministic-vs-transient error split", () => {
  it("finds mutation actions (extractor sanity)", () => {
    expect(mutationActions.length).toBeGreaterThan(5);
  });

  it("every mutation action inspects error codes (no all-coded-→-retry collapse)", () => {
    const collapsers = mutationActions
      .filter((p) => !performsSplit(p))
      .map((p) => p.file)
      .filter((f) => !(f.split("/").pop()! in COLLAPSE_ALLOWLIST));
    // A collapser returns only retry keys from its catch block — a coded error
    // (23505 / 42501 / P0001) becomes "try again" and loops the user. Add the
    // split in-file (`if (error.code === …)`) or in the db module it imports.
    expect(
      collapsers,
      "mutation actions that never inspect error.code (retry-loop risk)",
    ).toEqual([]);
  });

  it("the collapse allowlist stays minimal and every entry is a real action", () => {
    const names = new Set(mutationActions.map((p) => p.file.split("/").pop()!));
    for (const entry of Object.keys(COLLAPSE_ALLOWLIST)) {
      expect(names.has(entry), `${entry} must be a real mutation action`).toBe(
        true,
      );
    }
    expect(Object.keys(COLLAPSE_ALLOWLIST).length).toBeLessThanOrEqual(3);
  });
});
