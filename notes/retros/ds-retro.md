# DS Retro — Design-System three-layer hardening

> Dated 2026-06-08. Authored at closure. 14 issues across 4 waves (0–3)
> + closure PR. Three-layer model: spec (Wave 0–1) → primitives (Wave 2)
> → CI enforcement (Wave 3). Lens: **was the verification real?**
>
> Parallel retro lenses: code-reviewer + senior-engineer (this file).
> Reconciled into single retro per M3/M4/M5 pattern.

---

## TL;DR

DS shipped all 14 issues across 4 waves with zero schema, zero new server
actions, and zero feature surface. The three-layer model is real — each
layer has an enforceable artifact, not just prose. Two verification gaps
survived to closure: `<Identifier>` (#215) ran its pre-merge smoke against
a local dev server (not the Vercel preview), and `invite-list.tsx` was not
rewired to consume `<Identifier>` before merge. Both are carry-forwards
with explicit ADR entries. The token drift finding (#182/0e) was the most
consequential discovery: two tokens cited in the spec (`--radius-xs`,
`--surface-error`) are absent from `globals.css`. Surfacing that drift was
the right call; encoding a lint rule against a phantom token would have
been worse.

---

## What shipped

14 issues, 13 PRs (#276–#287) across 4 waves + this closure PR:

| Wave | PRs | Issues |
|---|---|---|
| **0 — foundation** | #276, #277, #278, #279, #280 | #213 three-layer ADR · #211 date/time register · #212 home-tab anatomy + mockup · v3 skeleton + execution plan · #182 token re-verify note |
| **1 — v3 contracts** (2 serialized) | #281, #282 | #183 component bindings · #184 verbs table · #185 empty-state register · #208 RSVP chip · #209 error-surface · #210 destructive-action |
| **2 — primitives** (2 parallel) | #283, #284 | #215 `<Identifier>` (40 tests, security+code review, 375px smoke) · #216 `useDisplayName` (10 tests, no-local-part grep) |
| **3 — CI/infra** (3 parallel) | #285, #286, #287 | #186 PR-template · #217 visual baselines (Mobile-Chrome 375×812) · #182 ESLint anti-tells (22 tests) |

Each layer has an enforceable artifact: Layer-1 contracts cite real
`lib/copy/*` keys; Layer-2 primitives are tested + smoked; Layer-3 is a
lint rule that fires + a visual baseline that catches a seeded regression.

---

## What worked (real verification + rigorous execution)

**Override D (scoped parallel reviewers) executed cleanly.**
`security-reviewer` + `code-reviewer` were dispatched in one batch on the
`<Identifier>` serialization-boundary PR (#283); every other PR ran
`code-reviewer` only. Scope was never blurred. Fix-ups stayed in one
consolidated round under the 100-LOC budget on each PR that needed one.

**Override H (single-file serialization) held with zero collisions.**
Six Wave-1 contracts landed in two strictly serialized PRs (#281 → #282),
PR-B opened only after PR-A merged, appending into the pre-committed v3
skeleton (PR #279). Parallel agents were never pointed at the shared file.

**Override B (Wave-0 as hard merge-blockers) enforced.** All 12 downstream
PRs are traceable to the five Wave-0 deliverables; none opened against a
missing foundation. No `test.fixme` substitutes.

**TDD on Wave 2 was substantive, not checkbox.** #215's 40 tests include
6 injection vectors (RTL-override, `javascript:`, `file://`, `${}`, 10 KB)
× 4 assertions proving inert text + verbatim clipboard. #216's 10 tests +
the live-repo `.split("@")[0]` grep. No new dependency across 13 PRs
(`no-restricted-syntax` only; clipboard reused from `copy-link-button.tsx`).

**Layer 1 spec — contracts cite real keys, not prose.**
Override F held across all six v3 contract subsections (#183–#185,
#208–#210). Every Wave-1 string reference points to a `lib/copy/*` key that
already exists (verified against the Reality-check key list in
`ds-execution-plan.md`). The account-existence leak audit on #209 (`grep
-niE "no account|already (exists|registered)"`) returned empty before
merge. These are grep-verifiable, not honor-system promises.

**Layer 3 enforcement — both CI tools prove they fire on bad input.**
`#182` ESLint: the known-bad fixture test (`tests/unit/eslint-anti-tells
.test.ts`) asserts that each of the four rule classes (light-mode utils,
emoji-as-icon, UUID-in-JSX-text, non-token button radius) fires against
a contrived fixture. The test is not green because the rule is absent; it
is green because the rule fires. That distinction matters — a missing rule
would silently pass. `#217` visual baseline: the seeded-regression proof
(0.50 diff ratio on a deliberate 1-px pixel mutation) confirms the diff
*fails* before the revert. A baseline that never fails on a known
regression is theater; this one is not.

**Token drift surfaced before encoding (#182/0e).**
The Wave-0e grep revealed `--radius-xs` and `--surface-error` absent from
`globals.css`. Recording the drift before #182 authored its rules prevented
a lint rule that would have referenced a non-existent token — a rule that
would have silently mis-fired or required dead class removal on code that
was actually correct. The correct resolution (d-ii: ban the class patterns
structurally without a token reference) made rule (d) implementable without
first shipping the token.

**Scope held: ZERO schema, ZERO server actions, ZERO feature surface.**
Confirmed across all 14 PRs (#276–#287). No migration files proposed or
merged. The real-trip retro gate is explicitly unchanged.

---

## What slipped / surprised (gaps and carry-forwards)

**Two reviewer-caught defects required fix-ups (the review process worked).**
On #281, the component-bindings draft listed `announcements-author` as a
`useDisplayName`/`resolveMemberName` consumer — wrong: that surface is the
divergent SQL-join path the open #250 carry-back is about consolidating.
The code-reviewer caught it; a one-commit fix-up dropped the binding. On
#283, the `<Identifier>` idle button label shipped as the inline literal
`"Copy"` (Override F violation); the code-reviewer caught it, and the
fix-up sourced it from a new `identifier_copy` key. Both were the
anticipated single fix-up round — but both reveal first-draft blind spots:
the binding author treated #250 as resolved, and Override F wasn't
front-of-mind when writing the primitive's first draft.

**#182 `cn()` / dynamic-class enforcement gap.** The anti-tells use
`no-restricted-syntax` on `className` string *literals* — classes composed
through `cn()` / `clsx` / template literals are invisible to the rules. The
fix-up documented this limitation in the config comment, but it means a
determined dev can bypass the bans by computing the class at runtime. The
PR-template `#186` human check is the backstop; the lint is not airtight.

**`#215` pre-merge smoke ran locally, not on Vercel preview.**
Override A required a Playwright smoke at 375×812. The MCP-driven session
ran against a local `next dev` server because `/dev/smoke` 404s on the
Vercel preview under the `NODE_ENV=production` gate. Local-smoke is an
acceptable `[d]` signal — and for DS it is also the *strongest available*
`[v]`, because **the primitive has no production surface to walk**:
`/dev/smoke` 404s in prod by design, and `invite-list.tsx` was not
rewired. The local smoke did exercise the load-bearing behavior (375px
render, raw-value-verbatim clipboard read-back, `aria-live` fires, zero
console errors). Since DS is a between-milestones pre-gate infra wave
(not a feature milestone), the **production-consumer walk is a
carry-forward gated on wiring `<Identifier>` into `invite-list`** — it is
NOT a blocker for DS shipping. `#215 [v]` is recorded as *verified via
local dev smoke; prod-consumer walk deferred*. (Production root itself is
healthy — `curl` returns 200 in ~0.2s; the Playwright 504s seen at
closure were per-region serverless cold-starts, not an outage.)

**`#215` has no production consumer yet (`invite-list.tsx` not rewired).**
The primitive shipped ahead of its consumer. The architect adjudicated this
acceptable (one verified consumer exists at `invite-list.tsx:64`; the issue
is wiring, not existence). The carry-back is explicit: rewiring
`invite-list.tsx` to render `<Identifier value={token} copyable />` instead
of the raw `<code>` block is the first `[v]` prerequisite, because the
production walk walks *that surface*. Shipping a primitive ahead of its
consumer is defensible when the consumer is known and bounded; it becomes
a problem if the wiring slips into M6.

**`#216 useDisplayName` — real DRY, but marginal ROI.**
The hook wraps `resolveMemberName` one-to-one with no additional logic
beyond stripping the email local-part (which `resolveMemberName` already
doesn't expose). The no-local-part grep audit is the genuine value-add:
asserting `grep -rn '.split("@")[0]'` returns empty means the constraint
is machine-checked at every future CI run, not just at time of authoring.
The hook itself is a thin wrapper; the repo-wide grep it validates is the
actual enforcement.

**Home-tab anatomy spec (#212) carries a cross-OS font risk.**
The static mockup in `notes/design-system.md` renders Fraunces +
Switzer via Fontshare CDN. The metric-locked `@font-face` fallback block
(Georgia → Fraunces, Arial/Roboto → Switzer) specifies `size-adjust` /
`ascent-override` values described as "representative — re-run Capsize /
Fontaine at implementation time." Those values have not been validated
against the actual woff2 files. On Android Chrome (which falls through to
Roboto), the fallback chain is specced but untested. This is a carry-forward
for M1 #69 implementation, not a DS scope item — but it should be on the
M6 Wave 0 checklist.

**Radius-scale drift is pre-existing but now formally recorded.**
`globals.css` ships the shadcn-default `calc()` radius scale (effectively
`--radius-sm` ≈ 6px, `--radius-md` ≈ 10px, etc.) — the "poisoned middle"
the spec bans. This predates DS; #180 closed without fixing it. The 0e note
records it explicitly. The `fix: bind radius scale to the polar spec`
follow-up must land before any component cites `--radius-xs: 2px` in a
lint rule.

---

## Process learnings

**Declaration-vs-verification discipline (Override E) caught the smoke gap.**
Having two distinct checkboxes (`[d]` declared / `[v]` verified) forced an
honest audit. Without that split, "CI green + screenshot attached" would
have been conflated with "production walk confirmed." The gap between local
smoke and production walk is exactly what M2-retro identified as the root
cause of the P0 found post-declaration. The Override E pattern earns its
keep again.

**Override H (single-file serialization) had zero collisions.**
Six Wave-1 issues appended to the same file across two serialized PRs with
no merge conflicts. The v3 skeleton (empty subsection headers committed in
Wave 0d) is the mechanism — parallel agents cannot collide on pre-agreed
empty slots. Worth carrying into any future milestone that has multiple
agents writing to a shared spec file.

**Token re-verification before encoding rules (0e → #182) is load-bearing.**
The 0e deliverable exists precisely because #180 closed without confirming
all cited tokens landed in CSS. Doing the grep *before* the ESLint rule is
authored eliminates a class of "rule fires on correct code" bugs. This
pattern should be a standing pre-condition for any lint rule that references
a CSS custom property.

**Component-binding tables must cross-reference open carry-backs.** The
#281 `announcements-author` slip happened because the binding author read
#250 (announcements author-enrichment consolidation) as resolved when it's
still open — so it bound a primitive to a surface that uses a divergent
path. Any future "which component consumes which primitive" table should
grep open issues for the surfaces it names before asserting "binds today."

---

## Recommendation for next session

1. **Wire `<Identifier>` into `invite-list.tsx`, then walk it.** The
   primitive shipped ahead of its one known consumer. The follow-up:
   rewire `invite-list.tsx:64` from the raw `<code>{token}</code>` to
   `<Identifier value={token} copyable />`, then run the MCP Playwright
   walk against the production invites surface at 375×812 (long-press →
   clipboard read-back → aria-live → screenshot) and tick the deferred
   `#215` prod `[v]`. This is a carry-forward, NOT a DS-closure blocker —
   DS ships with `#215` verified by local smoke. Don't let the wiring
   slip past the next feature milestone, or the primitive is dead code.

2. **Radius-scale fix as M6 Wave 0 infra.** Add `--radius-xs: 2px` (and
   reconcile the shadcn-default calc scale to the polar spec) in the M6
   Wave 0 foundations PR, before any component layer cites it. Scope:
   one migration of `globals.css` + one ESLint rule (d) update.

3. **Android fallback metrics before M6 #69 implementation.** Run Capsize /
   Fontaine against the actual Fraunces and Switzer woff2 files, confirm
   the `size-adjust` + `ascent-override` values, and add the Android-Chrome
   FOUT test case to the M6 browser-smoke checklist.

4. **`useDisplayName` no-local-part grep to CI.** The grep currently lives
   in the Wave-2 verification gate (manual). Move it to a `pnpm test`
   target so it runs on every PR without a manual step.
