/**
 * I12 — callAction never wraps a redirect() action (silent-nav gate).
 *
 * THE INVARIANT (#438): `callAction` converts a transport REJECT into the
 * `{ ok: false, errorKey: "network" }` envelope by catching it. Next's
 * `redirect()` navigates by THROWING a `NEXT_REDIRECT` sentinel, so wrapping a
 * redirecting action in callAction swallows the navigation and hands the caller
 * a bogus `{ ok: false }` — the redirect silently never happens. A redirecting
 * action must be awaited BARE.
 *
 * THE TELL: a `callAction(() => X(...))` whose target X is an exported action
 * that calls `redirect()`.
 *
 * THE CHECKER (this file): derives the redirecting-action set FROM SOURCE
 * (redirectingActions — no hand-maintained list to rot) and asserts no
 * callAction site in app/ or components/ wraps one. Locks the JSDoc warning in
 * lib/ui/call-action.ts into CI. Baseline clean: signOut / acceptInviteAction /
 * createTripAction are the redirecting actions and none is callAction-wrapped
 * (they're awaited bare from their forms / routes).
 *
 * SCOPE: the redirect-swallow footgun — the precise, exception-free slice of
 * I12. The broader "every client mutation call site triggers a refresh"
 * cross-reference is NOT statically decidable here: refresh routes through
 * callback props (a form's `onSaved` → a parent's `router.refresh()`), so a
 * component-local check would false-positive on ~10 legitimately-refreshing
 * forms. callAction's generic already binds each wrapped action to the ok/err
 * envelope at compile time; this gate closes the one hole TS can't see
 * (`redirect()` returns `Promise<never>`, assignable to anything).
 */

import { describe, it, expect } from "vitest";
import { join } from "node:path";

import {
  redirectingActions,
  callActionTargets,
} from "./meta/callaction-redirect";

const ACTIONS_DIR = join(process.cwd(), "lib/actions");
const UI_DIRS = [join(process.cwd(), "app"), join(process.cwd(), "components")];

const redirecting = redirectingActions(ACTIONS_DIR);
const sites = callActionTargets(UI_DIRS);

describe("I12 — callAction ∌ redirect", () => {
  it("derives redirecting actions and callAction sites (extractor sanity)", () => {
    // The three known redirectors must be detected — a regression that stops
    // detecting them would make the gate vacuous.
    expect(redirecting.has("signOut")).toBe(true);
    expect(redirecting.has("acceptInviteAction")).toBe(true);
    expect(redirecting.has("createTripAction")).toBe(true);
    expect(sites.length).toBeGreaterThan(10);
  });

  it("no callAction wraps a redirect() action (#438)", () => {
    const offenders = sites
      .filter((s) => redirecting.has(s.target))
      .map(
        (s) =>
          `${s.file}:${s.line} callAction(() => ${s.target}(…)) — redirect() would be swallowed; await it bare`,
      );
    expect(offenders, "callAction wrapping a redirecting action").toEqual([]);
  });
});
