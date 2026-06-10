# DS Execution Plan — Design-System three-layer hardening

> Dated 2026-06-08. Structured for a `/goal`-driven, subagent-parallel
> push. Mirrors `m3-execution-plan.md` shape (Constraints → waves →
> file-ownership matrices → per-primitive contracts → DoD `[d]`/`[v]` →
> closure checklist → per-wave reading lists). The goal loop reads this
> file on every turn — keep it terse and verifiable. Tick DoD checkboxes
> as work lands.
>
> Source of scope: the `ds — Design-System three-layer hardening`
> milestone issues (14): #182, #183, #184, #185, #186, #208, #209, #210,
> #211, #212, #213, #215, #216, #217. Three-layer model per ADR #213
> (spec → primitives → enforcement).

## Milestone framing (load-bearing — re-read every wave)

This is a **BETWEEN-MILESTONES, PRE-GATE wave.** It ships ONLY
spec / primitives / CI enforcement. It carries:

- **ZERO real-trip data.** No seeded trips, no member rows, no fixtures
  that imply a live trip.
- **ZERO schema.** No migration files. **If any PR proposes SQL,
  hard-reject it** (architect sign-off, non-negotiable).
- **ZERO new server actions.** Primitives are pure UI / pure resolver.
- **ZERO gated feature surface.** No M6 feature is built, stubbed, or
  cross-linked. The `#212` "what's-now" home-tab anatomy stays a
  *markdown spec*, NOT a live surface — zero JSX, zero component, zero
  data wiring.

North star unchanged: **one bachelor party, insider (celebrant-vs-
organizer) threat model.** This milestone hardens the design system so
the next gated milestone inherits enforceable primitives — it does not
expand product surface.

> ### ⛔ Real-trip retro gate STILL IN PLACE
> DS does **not** lift, touch, or depend on the real-trip retrospective
> gate. **M6 features remain gated** exactly as before. Shipping DS makes
> the design system enforceable; it changes nothing about the gate. The
> closure ADR records "DS shipped WITH the real-trip gate STILL in
> place." Do **not** mark a roadmap milestone done. Do **not** claim the
> gate is lifted.

---

## Constraints (re-read every wave)

These adapt the M3 Overrides A–G to a docs/primitives/CI milestone and
add a milestone-specific Override H.

### Override A — Real-browser 375×812 smoke (scoped to #215 ONLY)
CI green ≠ primitive works. **Applies to `#215 <Identifier>` only** —
the other deliverables are markdown, CI config, or non-visual resolver
code. The `#215` PR runs an MCP-driven Playwright session against the
Vercel preview at 375×812, exercises long-press/click-to-copy, and pastes
a screenshot into the PR body under `## Preview smoke (375px)`. Without
that section, `#215` does not merge. No other PR needs this section.

### Override B — Cross-wave infra lands in Wave 0, no `test.fixme` substitutes
The Wave-0 contracts (the `#211`/`#212`/`#213` docs), the v3
section-ownership skeleton in `design-system.md`, and the `#182` token
re-verification grep note are **Wave 0** deliverables — hard
merge-blockers before any Wave 1/2 PR opens. No primitive PR may stub a
contract with `test.fixme` and defer; the contract it consumes must
already be on `main`.

### Override C — Tests live in `lib/`, `components/`, `tests/unit/` only
`app/` is excluded from the vitest glob. Every PR with tests gets a
manual `grep -rEn "describe\(|test\(|it\(" app/` check by the wave agent
— non-empty = fail the wave gate. (Wave 0/1/3 are docs/CI and own no
component tests; the guard still runs and must return empty.)

### Override D — Reviewers dispatch in PARALLEL; security-reviewer scoped
On PR open, dispatch `code-reviewer` always. Dispatch `security-reviewer`
**in the same batch (single message)** but **only on serialization-
boundary PRs** — that is `#215 <Identifier>` (clipboard write + URL
embed). Pure-docs PRs (Wave 0, Wave 1) and pure-CI PRs (Wave 3) and the
non-serialization resolver (`#216`) run **`code-reviewer` only**. One
consolidated fix-up round, **< 100 LOC**; do not stage round-2 reviews.

### Override E — DoD has a `verified` axis
Each DoD line has two checkboxes:
- `[d]` *declared*: shipped, CI green, reviewer(s) approved.
- `[v]` *verified*: exercised at closure (prod browser walk for `#215`;
  docs-landed + seeded-fixture-fires for everything else).

`[d]` ✓ is allowed mid-milestone; `[v]` ✓ is **closure-only**.

### Override F — No inline UI string literals; contracts cite KEY NAMES
Every UI string is sourced from `lib/copy/*`. Wave-1 contracts **cite
`lib/copy/*` KEY NAMES, never illustrative literals**:
- `#185` empty-state register → `EMPTY_STATES` keys
- `#209` error-surface contract → `ERRORS` keys + `--surface-error`
- `#208` RSVP chip contract → `rsvp_chip_*` keys
- `#210` destructive-action contract → `*_confirm` keys

`#185` and `#209` must ship **ENUMERATED, voice-checked copy** (real
strings, not empty slots). `#209` **must not leak account-existence** in
any error string.

### Override G — `app/page.tsx` ownership at closure
Closure either updates `app/page.tsx` to reflect DS reality OR writes a
one-line explicit "kept as-is, decision: …" in the closure ADR.
Orphaning the landing page through another milestone is out of bounds.
(DS adds no surface, so "kept as-is" is the expected outcome — but it
must be **explicitly** recorded.)

### Override H — Single-file serialization (milestone-specific)
Wave 1's six issues are **append-only** to `notes/design-system.md`
under **one new `## Component & content contracts (v3)` block**, shipped
in **two serialized PRs (PR-A before PR-B)**. **Never** run parallel
agents against the shared file. PR-B opens only after PR-A merges. The
v3 block skeleton (empty subsection headers) is committed in **Wave 0**
(deliverable 4) so both PRs append into a pre-agreed structure with zero
header collisions.

---

## Reality check (state at DS start)

- `notes/design-system.md` is ~676 lines. Line 664 begins
  `## v2 additions — rendering-context degradation (2026-05-19)`. The new
  **`## Component & content contracts (v3)`** block is inserted
  **immediately before line 664** (after v1 content, before the v2
  additions header) so v3 contracts sit with the contract material, not
  trailing the rendering-degradation appendix. *(Verified.)*
- `components/trip/invites/copy-link-button.tsx` already owns the canonical
  clipboard pattern: `navigator.clipboard.writeText` in a `try/catch`,
  `console.error` + `ERRORS.network` fallback, `aria-live="polite"`
  status/error spans, `h-11` tap target. **`#215` MUST reuse this — do
  not fork a second clipboard impl.** *(Verified at lines 25–39, 57–76.)*
- `lib/utils/member-display.ts#resolveMemberName(memberMap, id)` is the
  single name-resolution path; fallback is
  `M3_UI_STRINGS.roster_member_fallback_name` (= `"Guest"`). **`#216`
  `useDisplayName` MUST wrap this — single resolution path.** *(Verified.)*
- `#215`'s real consumer today: `components/trip/invites/invite-list.tsx:64`
  renders a raw token in `<code class="… truncate max-w-[120px]">`.
  *(Verified at line 64.)*
- Copy keys that already exist and are cited by Wave-1 contracts:
  `rsvp_chip_going|maybe|declined` + `rsvp_chip_aria_*`,
  `roster_member_fallback_name`, `invitesPage_copy_link_cta`,
  `invitesPage_copied`. `ERRORS` keys: `network`, `rls_denied`,
  `validation_failed`, `rate_limit`, `idempotency_replayed`, `auth_failed`,
  `invite_*`, plus the M3 `<feature>_<verb>_failed` family. *(Verified.)*

**Schema reality:** unchanged. **DS adds zero migrations.** Any SQL in a
DS PR is a hard-stop.

---

## Wave 0 — Foundation (markdown-only; 7 hard merge-blockers)

All seven deliverables must merge to `main` **before** Wave 1 or Wave 2
opens. Wave 3's `#182` is additionally gated on **deliverable 5** (the
token re-verification note). Markdown / config only — zero JSX, zero
component, zero data wiring. **The `#212` home-tab "what's-now" anatomy
is a SPEC, not a live surface.**

| ID | Branch | Closes | Owns (files) | Tests claimed | Risk |
|---|---|---|---|---|---|
| **0a** | `docs/ds-three-layer-adr` | #213 | `notes/decisions.md` (append #213 three-layer enforcement ADR at top) | none (docs) | low |
| **0b** | `docs/ds-datetime-register` | #211 | `notes/design-system.md` (append **date/time format register + primitive contracts** subsection — date-fns format tokens, the canonical render strings, the primitive contract surface) | none (docs) | low |
| **0c** | `docs/ds-home-tab-anatomy` | #212 | `notes/design-system.md` (append **home-tab anatomy spec — markdown ONLY**; what's-now / next semantics as prose; explicit "NOT a live surface" banner) | none (docs) | low |
| **0d** | `docs/ds-v3-skeleton-and-dod` | — | `notes/design-system.md` (commit the empty **`## Component & content contracts (v3)`** block skeleton with the 6 named subsection headers, inserted before line 664), `notes/ds-execution-plan.md` (this file — DoD `[d]`/`[v]` skeleton incl. 375px-smoke gate on #215 + security-reviewer-on-#215 declaration + self-merge-eligibility declaration) | none (docs) | low |
| **0e** | `chore/ds-token-reverify` | — (prereq for #182) | `notes/design-system.md` (append **#182 token re-verification note**: record the grep result of `app/globals.css` token names ∩ `design-system.md` token names; record any drift; resolve names before #182 encodes them) | none (CI prep) | low |

> **Grouping:** `0a` is the ADR (its own PR — different file). `0b`,
> `0c`, `0d`, `0e` all append to `design-system.md` and therefore must
> **merge sequentially** (Override H applies to the doc generally, not
> just the v3 block). Recommended merge order: `0b → 0c → 0d → 0e`,
> each rebased on the prior. `0a` merges independently in parallel.

**The 7 Wave-0 deliverables (mapped to PRs):**

1. `#213` three-layer enforcement ADR → `notes/decisions.md` (**0a**).
2. `#211` date/time format register + primitive contracts (**0b**).
3. `#212` home-tab anatomy, markdown ONLY (**0c**).
4. v3 section-ownership map committed — the `## Component & content
   contracts (v3)` block skeleton in `design-system.md` (**0d**).
5. `#182` token re-verification note — grep result recorded (**0e**).
6. DoD `[d]`/`[v]` skeleton incl. the 375px-smoke gate on `#215` and the
   security-reviewer-required-on-`#215` declaration (**0d**).
7. Self-merge-eligibility declaration: **docs/CI PRs are self-merge-OK;
   `#215` and `#216` are NOT self-merge** (`#215` needs other-dev review
   for the serialization boundary; `#216` requires other-dev review per
   architect) (**0d**).

**Gate to Wave 1 & Wave 2 (run AFTER 0a–0e merge):**
```
pnpm typecheck && pnpm lint && pnpm test && pnpm build   # docs-only: green expected
grep -rEn "describe\(|test\(|it\(" app/ || echo "OK: no tests in app/"
# Confirm the v3 block skeleton + 6 subsection headers exist:
grep -n "## Component & content contracts (v3)" notes/design-system.md
# Confirm the token re-verify note recorded a grep result (drift resolved):
grep -n "token re-verification" notes/design-system.md
```
Wave 1 and Wave 2 stay closed until items 1–7 merge. Wave 3 `#182`
additionally gated on item 5 (token note) being on `main`.

**Out of scope for Wave 0:** any JSX, any component, any test file, any
live surface, any SQL.

**Risk: low.** Pure markdown/config. The only failure mode is doc-merge
ordering on the shared `design-system.md` — handled by sequential rebase.

---

## Wave 1 — v3 contracts (SINGLE file, 2 serialized PRs)

Opens after Wave 0 merges. **All six issues append new subsections under
the Wave-0 `## Component & content contracts (v3)` block in
`notes/design-system.md`.** Per **Override H**: two serialized PRs,
PR-A before PR-B, **never parallel agents on the shared file.**

| ID | Branch | Closes | Owns (files) | Tests claimed | Risk |
|---|---|---|---|---|---|
| **1-A** | `docs/ds-v3-contracts-a` | #183, #184, #185 | `notes/design-system.md` (append, in order: **#183 component bindings → #184 verbs table → #185 empty-state register**) | none (docs) | low |
| **1-B** | `docs/ds-v3-contracts-b` | #208, #209, #210 | `notes/design-system.md` (append, in order: **#208 RSVP chip shape contract → #209 error-surface contract → #210 destructive-action contract**) | none (docs) | low |

> **Sequential-merge note (Override H):** `1-B` opens **only after** `1-A`
> merges to `main`. Both touch the same file under the same v3 block;
> running them in parallel would collide. `1-A` agent writes its three
> subsections; `1-B` agent rebases on merged `1-A` and appends its three
> below them. **Zero parallel agents on `design-system.md`, ever.**

**Contract content rules (Override F — cite KEY NAMES, not literals):**

- **#183 component bindings** — map each v3 contract to its real consumer
  component (e.g. `<Identifier>` → `invite-list.tsx:64`; the verbs table →
  destructive buttons). Bindings reference component paths, not literals.
- **#184 verbs table** — canonical action verbs (Copy / Revoke / Remove /
  Leave / Delete …) and their copy-key sources; routes voice/semantic
  tells to the `#186` checklist, not to lint.
- **Existing-keys-only rule (Phase-4 finding):** Wave-1 contracts reference
  copy KEYS that already exist in `lib/copy/*` (verified set in Reality
  check). If a contract needs a net-new key, that key is **out of DS
  scope** — note it as a follow-up, do not author copy ahead of a
  consumer. The contract documents the binding, not new strings.
- **#185 empty-state register** — **ENUMERATED, voice-checked** copy
  keyed by `EMPTY_STATES` key names. Real strings, not empty slots. Each
  passes the "would you say this at a pre-trip dinner?" test.
- **#208 RSVP chip shape contract** — cite `rsvp_chip_*` keys. **Document
  `◐` = "undecided" ONLY.** Explicitly note that **per-day partial
  attendance is a SEPARATE future primitive — do NOT foreclose per-day
  RSVP** in this contract.
- **#209 error-surface contract** — **ENUMERATED, voice-checked** copy
  keyed by `ERRORS` key names + the `--surface-error` token. **Must not
  leak account-existence** in any string (no "no account with that
  email" / "account already exists" variants).
- **#210 destructive-action contract** — cite `*_confirm` keys; define
  the confirm-affordance shape (the verb, the consequence line, the
  cancel path) for Revoke / Remove / Leave / Delete.

**Verification gate after Wave 1:**
```
pnpm typecheck && pnpm lint && pnpm test && pnpm build   # docs-only green
grep -n "## Component & content contracts (v3)" notes/design-system.md
# All six subsections present under the v3 block:
grep -nE "#183|#184|#185|#208|#209|#210" notes/design-system.md
# #209 account-existence leak audit (must return nothing):
grep -niE "no account|already (exists|registered)|account (exists|not found)" notes/design-system.md || echo "OK: no account-existence leak"
```
**Risk: low.** Docs only; the single-file serialization is the only
coordination risk, fully handled by Override H.

---

## Wave 2 — Primitives (2 PRs, distinct files, parallel-eligible)

Opens after Wave 0 merges (independent of Wave 1; both consume Wave-0
contracts, not each other). Two PRs, **distinct files, parallel-
eligible**, each its own PR. **Neither is self-merge** (Wave-0 declared).

| ID | Branch | Closes | Owns (files) | Tests claimed | Risk |
|---|---|---|---|---|---|
| **2a** | `feat/ds-identifier-primitive` | #215 | `components/ui/identifier.tsx` (new) | `components/ui/__tests__/identifier.test.tsx` | medium |
| **2b** | `feat/ds-use-display-name` | #216 | `lib/hooks/use-display-name.ts` (new) | `lib/hooks/__tests__/use-display-name.test.ts` | low |

**Coordination rule:** zero file overlap. `2a` owns `components/ui/**`;
`2b` owns `lib/hooks/**`. Neither touches `lib/copy/*`, `lib/utils/
member-display.ts`, or `components/trip/invites/copy-link-button.tsx`
(both reuse those read-only as DRY anchors). Both may run in parallel.

**Reviewers (Override D):**
- `2a` (#215): **`security-reviewer` + `code-reviewer` in parallel** —
  serialization boundary (clipboard write + URL).
- `2b` (#216): **`code-reviewer` only** — no serialization boundary.

**TDD discipline (M3-retro §4 carry-forward):** both Wave-2 agents are
`tdd-guide` — **write the enumerated tests FIRST (RED), then minimal
impl (GREEN), then refactor.** The `#215` injection-vector set and the
`#216` hit/miss/empty-map + no-local-part cases are the RED batch. 80%+
coverage on new code.

**`<Identifier>` label voice-gate (Phase-4 finding):** the optional
`label` prop renders directly in UI. Any caller-supplied label string
must pass the "would you say it at a pre-trip dinner?" test (e.g.
"link to send your crew" not "Invitation URL"). This is added as a
`#186` PR-template checklist line (Wave 3) and a `#215` DoD condition.

### Per-primitive contract table (architect-signed)

| Primitive | API | Renders | Serialization boundary | Required tests | 375px smoke | DRY anchor | Real consumer today |
|---|---|---|---|---|---|---|---|
| **`<Identifier>`** (#215) | `({ value: string; label?: string; copyable?: boolean }) → JSX` | raw `value` in `font-mono` + truncation; optional long-press / click to copy. **NO hashing / short-hash** (trimmed — security-theater dropped). | **YES** (clipboard write + URL) | render; `copyable` on/off; **INJECTION vectors** — `value` containing `\n`, `file://`, `javascript:`, `${}`, `U+202E` RTL-override, and a 10 KB string → **assert each is written as inert text, never executed / interpolated / URL-coerced** | **YES** | **MUST reuse** `components/trip/invites/copy-link-button.tsx` clipboard `try/catch` + `ERRORS.network` fallback + `aria-live`. **Do NOT fork a 2nd clipboard impl.** | `invite-list.tsx:64` (raw token `<code>`) |
| **`useDisplayName`** (#216) | `(memberMap, id) → string` (resolver-wrapping hook) | n/a (non-visual) | **NO** | hit; miss → fallback; empty-map; **no-local-part audit** — repo grep asserting **no `.split("@")[0]`** / email-derived display anywhere (grep both **producer and consumer**) | **NO** (non-visual) | **MUST wrap** `lib/utils/member-display.ts#resolveMemberName` (single resolution path). Fallback stays `M3_UI_STRINGS.roster_member_fallback_name`. | resolver consumers across roster / announcements |

> **`#215` injection-test intent:** the primitive renders identifiers
> that originate from URLs and tokens. The boundary tests prove the
> rendered value is **inert text** — it is never interpolated into a URL,
> never `dangerouslySetInnerHTML`, never `eval`-adjacent, and the RTL
> override / newline / 10 KB cases don't break layout or clipboard.
> The clipboard write reuses the existing `try/catch` + `ERRORS.network`
> + `aria-live` path verbatim.

> **`#216` no-local-part audit:** the milestone forbids deriving a
> display name from an email local-part. The test greps the repo for
> `.split("@")[0]` (and email-local-part patterns) and asserts zero hits
> in both producers (anything that writes a display name) and consumers.

**Verification gate after Wave 2:**
```
pnpm typecheck && pnpm lint && pnpm test && pnpm build
grep -rEn "describe\(|test\(|it\(" app/ || echo "OK: no tests in app/"
# #216 no-local-part audit (must return nothing):
grep -rn '\.split("@")\[0\]' lib/ components/ app/ || echo "OK: no email-local-part display derivation"
# ^ promoted to a pnpm-test target post-ds (tests/unit/no-local-part-audit.test.ts)
#   — runs on every PR; the manual grep is now redundant.
# #215 single clipboard impl (no fork): clipboard.writeText should appear
# only in copy-link-button.tsx and identifier.tsx (which reuses the path):
grep -rln "clipboard.writeText" components/ lib/
# #215 only — MCP-Playwright preview at 375x812: long-press/click copies
# the raw value; screenshot into PR body under "## Preview smoke (375px)".
```
**Risk: medium (#215), low (#216).** `#215`'s clipboard + injection
surface is the only security-sensitive code in the milestone.

---

## Wave 3 — CI / infra (3 PRs, distinct files, parallel-eligible)

Opens after Wave 0 merges. `#182` additionally gated on Wave-0
deliverable 5 (token re-verify note on `main`). Three PRs, **distinct
files, parallel-eligible**.

| ID | Branch | Closes | Owns (files) | Tests claimed | Risk |
|---|---|---|---|---|---|
| **3a** | `chore/ds-eslint-anti-tells` | #182 | `eslint.config.*` (add anti-tell rules — `no-restricted-syntax` / class-string bans), `tests/unit/eslint-anti-tells.test.ts` (known-bad fixture asserting each rule fires) | `tests/unit/eslint-anti-tells.test.ts` | medium |
| **3b** | `docs/ds-pr-template-ui-checklist` | #186 | `.github/pull_request_template.md` (**AMEND** existing microcopy checklist item — do not duplicate it; add focus ring, reduced-motion, hairline guardrail, vibecoded-bans, copy-palette sourcing, `<Identifier>` caller-label voice-gate, governing design-system §quote requirement, semantic/voice tells routed here from #182) | none (docs) | low |
| **3c** | `test/ds-visual-baselines` | #217 | `playwright.visual.config.ts` (add/confirm the visual-regression project), `tests/visual/*.spec.ts` (visual baseline specs), `tests/visual/__screenshots__/**` (net-new baseline images) | `tests/visual/*.spec.ts` | medium |

**Coordination rule:** zero file overlap. `3a` owns `eslint.config.*` +
`tests/unit/eslint-anti-tells.test.ts`; `3b` owns
`.github/pull_request_template.md`; `3c` owns `playwright.visual.config.ts` +
`tests/visual/**`. All three run in parallel. All three are
**`code-reviewer` only** (no serialization boundary).

**Architect scoping (verbatim):**

- **#182** — scope to **~8 enumerable class/string bans** from the v1
  "Vibecoded-specific bans" table: **purple gradients, backdrop-blur
  cards, `border-l-4`, `bg-clip-text`, `h-screen`, centered hero**, plus
  the remaining two from that table. **Route semantic / voice tells to
  the `#186` checklist** (not to lint). **NO AST plugin** — use
  `no-restricted-syntax` / class-string matching. **Prerequisite
  (Wave-0 deliverable 5): grep `app/globals.css` token names ∩
  `design-system.md` token names, record drift, resolve names BEFORE
  `#182` encodes them.** `[v]` = **"rule fires on a known-bad fixture."**
- **#217** — trim to **ONE baseline browser: Mobile-Chrome 375×812;
  defer webkit/chromium.** **Baseline GENERATION is a net-new
  deliverable** (the `__screenshots__` images ship in this PR). `[v]` =
  **"baseline diff fails on a seeded regression"** — not just CI green.

**Verification gate after Wave 3:**
```
pnpm typecheck && pnpm lint && pnpm test && pnpm build
grep -rEn "describe\(|test\(|it\(" app/ || echo "OK: no tests in app/"
# #182: rule fires on the known-bad fixture (test asserts the violation):
pnpm test tests/unit/eslint-anti-tells.test.ts
# #217: baseline diff fails on a SEEDED regression (intentionally mutate a
# pixel, confirm the diff fails, then revert) — record in PR body.
pnpm exec playwright test --config=playwright.visual.config.ts
```
**Risk: medium (#182, #217), low (#186).** `#182` regression footprint
is real-class bans tripping legitimate code — the known-bad-fixture test
de-risks it. `#217` baseline generation flakiness is the other risk;
single-browser scoping (Mobile-Chrome only) contains it.

---

## DoD checklist (source of truth — check as work lands)

Two axes per Override E. `[v]` ticked at closure only.

**Wave 0 — Foundation (markdown / config)**
- [x]d [x]v #213 three-layer enforcement ADR in `notes/decisions.md` (PR #276) — landed on main
- [x]d [x]v #211 date/time format register + primitive contracts (PR #277) — landed on main
- [x]d [x]v #212 home-tab anatomy spec — **markdown only, NOT a live surface** (PR #278) — landed on main
- [x]d [x]v v3 section-ownership skeleton committed to `design-system.md` (PR 0d) — landed on main
- [x]d [x]v #182 token re-verification note (grep result recorded, drift resolved) (PR 0e) — found `--radius-xs` + `--surface-error` ABSENT; authoritative #182 ban list = issue's (a)/(b)/(c)/(d); rule (d) blocked on missing token → resolution recorded
- [x]d [x]v DoD `[d]`/`[v]` skeleton incl. 375px gate + security-reviewer on #215 (PR 0d)
- [x]d [x]v Self-merge-eligibility declaration (docs/CI OK; #215/#216 NOT) (PR 0d)

**Wave 1 — v3 contracts (single file, serialized)**
- [x]d [x]v #183 component bindings (PR 1-A) — landed on main (announcements-author binding dropped per reviewer / #250)
- [x]d [x]v #184 verbs table (PR 1-A) — landed on main
- [x]d [x]v #185 empty-state register — ENUMERATED voice-checked `EMPTY_STATES` keys (PR 1-A) — landed on main
- [x]d [x]v #208 RSVP chip shape contract — `◐` = "undecided" only; per-day deferred (PR 1-B) — landed on main
- [x]d [x]v #209 error-surface contract — ENUMERATED `ERRORS` keys + `--surface-error`; no account-existence leak (PR 1-B) — landed on main
- [x]d [x]v #210 destructive-action contract — `*_confirm` keys (PR 1-B) — landed on main

**Wave 2 — Primitives**
- [x]d [x]v #215 `<Identifier>` (PR #283) — 40 tests incl. injection vectors; security+code reviewed; **375px smoke verified on local dev** (render + raw-value-verbatim clipboard read-back + aria-live + zero console errors). `[v]` COMPLETE 2026-06-09: prod-consumer walk on `travelston.com` invites surface (post-#288/#291 wiring) — `<Identifier>` renders the token mono/truncated/display-only, Copy-link yields the full raw-token URL. Walk done in desktop-width Safari; the 375px layout half was already covered by the local-dev smoke. Walk also surfaced the unbound-`--destructive` / red-Revoke #210 drift (filed separately).
- [x]d [x]v #216 `useDisplayName` (PR #284) — wraps `resolveMemberName`; 10 tests; no-local-part grep returns zero hits

**Wave 3 — CI / infra**
- [x]d [x]v #182 ESLint anti-tells — issue's 4 bans (a/b/c/d), `app/(authed)/**`; 22 tests; **rule fires on known-bad fixture**; lint stays green on existing code (PR #287)
- [x]d [x]v #186 PR-template UI-checklist — governing-section quote + v3-contract + `<Identifier>` label voice items (PR #285)
- [x]d [x]v #217 visual baselines — Mobile-Chrome 375×812; **visual check green on ubuntu CI** + seeded-regression proof (0.50 diff ratio) (PR #286)

**Process / closure**
- [x]d [x]v `app/page.tsx` — **kept as-is** (DS added zero feature surface; decision recorded in closure ADR, Override G)
- [x]d [x]v `notes/retros/ds-retro.md` authored (2 reconciled lenses)
- [x]d [x]v `notes/decisions.md` "ds — design-system hardening — closed" ADR appended
- [x]d [x]v CLAUDE.md "Current phase" records DS shipped WITH real-trip gate STILL in place

---

## Closure wave checklist

Single branch: `chore/ds-done`. Single PR.

**Touches:**
- `app/page.tsx` — update for DS reality OR one-line "kept as-is,
  decision: …" in the closure ADR (Override G; "kept as-is" is the
  expected outcome since DS adds no surface).
- `notes/retros/ds-retro.md` (new) — mirrors `m3-retro.md` format:
  TL;DR, what shipped, what slipped, follow-up triage, process learnings.
- `notes/decisions.md` — append **"ds — design-system hardening —
  closed"** ADR at top, recording load-bearing execution decisions
  (Identifier short-hash trimmed, #217 single-browser, #182 ~8-ban scope,
  per-day RSVP not foreclosed) **and the explicit statement: "DS shipped
  WITH the real-trip retro gate STILL in place; M6 features remain
  gated."**
- `CLAUDE.md` — update "Current phase" to record DS shipped, **gate still
  in place.**
- `notes/ds-execution-plan.md` (this file) — tick `[d]` and `[v]` axes.

**Closure-deviation note (do NOT):**
- Do **NOT** mark a roadmap milestone done.
- Do **NOT** claim the real-trip gate is lifted.
- Do **NOT** flip any M6 surface to reachable.

**Final DS gate:**
```
1. Local green: pnpm typecheck && pnpm lint && pnpm test && pnpm build
2. Test-in-app check: grep -rEn "describe\(|test\(|it\(" app/ → 0 lines
3. CI rules fire on seeded fixtures:
   - #182: pnpm test tests/unit/eslint-anti-tells.test.ts → rule fires on known-bad
   - #217: seed a 1-px regression → baseline diff FAILS → revert
4. Docs landed: grep the v3 block + all 6 contract subsections + the
   #211/#212/#213 docs are on main
```

**Production browser walk (the ONLY golden-path UI walk):**
`#215 <Identifier>` long-press / click-to-copy at **375×812 on
travelston.com** via MCP-driven Playwright:
- Navigate to the surface rendering `<Identifier>` (the invite-list
  token consumer).
- Long-press / click the identifier → confirm the raw value is copied to
  the clipboard (read it back), confirm the `aria-live` status fires,
  confirm the truncated `font-mono` render at 375px.
- Screenshot into the closure PR under `## Production walk (375px)`.

No other DS deliverable has a golden-path UI walk — Wave 0/1 are docs
(verified by "docs landed on main"), Wave 3 is CI (verified by "rules
fire on seeded fixtures"), `#216` is non-visual (verified by the
no-local-part grep returning empty).

---

## Per-wave reading list (3–5 files max per wave's agent)

**Wave 0 (docs):**
1. `notes/m3-execution-plan.md` (Overrides A–G shape)
2. `notes/design-system.md` lines 640–676 (insertion point at line 664)
3. `notes/decisions.md` (top — append format)
4. `app/globals.css` (token names for the #182 re-verify grep)

**Wave 1 (v3 contracts):**
1. `notes/design-system.md` (the Wave-0 v3 block skeleton)
2. `lib/copy/empty-states.ts` (EMPTY_STATES + `rsvp_chip_*` key names)
3. `lib/copy/errors.ts` (ERRORS key names + `--surface-error`)
4. `notes/research/persona-edge-attendees.md` (RSVP-chip voice; opt-in framing)

**Wave 2 (primitives):**
1. `components/trip/invites/copy-link-button.tsx` (clipboard DRY anchor — #215)
2. `components/trip/invites/invite-list.tsx` (real consumer at :64 — #215)
3. `lib/utils/member-display.ts` (`resolveMemberName` DRY anchor — #216)
4. `lib/copy/empty-states.ts` (`roster_member_fallback_name` — #216 fallback)
5. The Wave-1 v3 contracts in `notes/design-system.md` (#215/#216 cite them)

**Wave 3 (CI / infra):**
1. `eslint.config.*` (current rule set — #182)
2. `notes/design-system.md` v1 "Vibecoded-specific bans" table (#182 ban list)
3. The Wave-0 #182 token re-verify note (#182 prereq)
4. `playwright.visual.config.ts` (#217 project setup)
5. `.github/pull_request_template.md` (#186 current template)

---

## Appendix — Per-wave hard-stop conditions

- 150 turns OR 2 consecutive wave-gate failures OR **any SQL/migration
  proposed** OR new dependency request → STOP and surface.
- **Wave 0:** 1 gate failure → stop (foundation blocks everything).
- **Wave 1:** the single-file serialization (Override H) is non-
  negotiable; if a parallel-agent collision on `design-system.md` is
  detected → stop, re-serialize.
- **Wave 2:** `security-reviewer` re-rejecting `#215` after the fix-up
  round → stop.
- **Wave 3:** #217 baseline flakiness across 2 runs → stop, surface.
- **Closure:** failed production `#215` copy walk → fix-then-retry once,
  then stop.

## New dependencies this milestone introduces

None expected. DS uses the existing browser `navigator.clipboard`,
existing ESLint, existing Playwright, and the existing shadcn / copy
palettes. Any agent-introduced dep is a hard-stop.
