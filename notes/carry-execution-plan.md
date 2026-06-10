# CARRY Execution Plan — CI-trust & token-drift

> Dated 2026-06-09. Structured for a `/goal`-driven, subagent-parallel
> push. Mirrors `ds-execution-plan.md` / `m3-execution-plan.md` shape
> (Constraints → waves → file-ownership matrices → per-PR contracts →
> DoD `[d]`/`[v]` → closure checklist → per-wave reading lists). The goal
> loop reads this file on every turn — keep it terse and verifiable. Tick
> DoD checkboxes as work lands.
>
> Source of scope: the `CARRY — CI-trust & token-drift` GitHub milestone
> **#8** (10 issues): #230, #207, #297, #188, #289, #155, #156, #157,
> #245, #250. These are M5 / trip-readiness / DS carry-backs — CI trust,
> token-cascade drift, one RLS tightening, and small cleanups.

## Milestone framing (load-bearing — re-read every wave)

This is a **BETWEEN-MILESTONES, PRE-GATE wave.** It carries:

- **ZERO feature surface.** No new pages, no new product capability. No
  M6 feature is built, stubbed, or cross-linked.
- **ZERO server actions.** No new mutation surface. Action *mocks* are
  edited in tests (Wave 0); no new action is authored.
- **ONE RLS-only migration** (#155) — drops + recreates a single SELECT
  policy on `public.invites`. No new tables, no new columns, no enum
  changes. **Any SQL beyond #155's single-policy swap is a hard-stop.**

North star unchanged: **one bachelor party, insider (celebrant-vs-
organizer) threat model.** This wave makes the test suite trustworthy,
closes the token-cascade drift the DS prod walk surfaced, tightens
invite visibility to organizers, and clears small carry-backs — it does
not expand product surface.

> ### ⛔ Real-trip retro gate STILL IN PLACE
> CARRY does **not** lift, touch, or depend on the real-trip
> retrospective gate. **M6 features remain gated** exactly as before.
> The closure ADR records "CARRY shipped WITH the real-trip gate STILL
> in place." Do **not** mark a roadmap milestone done. Do **not** claim
> the gate is lifted. Do **not** flip any M6 surface to reachable.

---

## Constraints (re-read every wave)

These carry the DS Overrides A–I verbatim-condensed, then add the
CARRY-specific rulings below them.

### Override A — Real-browser 375×812 smoke (scoped to surface-touching PRs)
CI green ≠ change works. The MCP-driven Playwright session at 375×812
against the Vercel preview, with a screenshot pasted under
`## Preview smoke (375px)`, is **required only on PRs that change a
rendered surface** — here that is **1a (#297)**, **1c (#289, if
in-scope)**, **2d (#156)**. Pure-test, pure-CSS-scope, pure-docs, and
RLS-only PRs do not need this section.

### Override B — Cross-wave infra lands first, no `test.fixme` substitutes
Wave 0 (CI trust) is a hard merge-blocker before any Wave 1/2 PR opens.
No later PR may stub a dependency with `test.fixme` and defer; the thing
it consumes must already be on `main`. The dependabot vitest bump (#270)
lands **before** the Wave-0 stress proof so the proof runs on the
shipped runner.

### Override C — Tests live in `lib/`, `components/`, `tests/` only
`app/` is excluded from the vitest glob. Every PR with tests gets a
manual `grep -rEn "\b(describe|test|it)\(" app/` check by the wave agent
— non-empty = fail the wave gate. (Word-boundary form is mandatory — the
bare `it\(` pattern false-matches `Submit(`.) Wave-1 (CSS/docs) and #155
(RLS) own no component tests; the guard still runs and must return empty.

### Override D — Reviewers dispatch in PARALLEL; security-reviewer scoped
On PR open, dispatch `code-reviewer` always. Dispatch `security-reviewer`
**in the same batch (single message)** but **only on the RLS PR (#155)**
— the only security-sensitive change in the wave. All other PRs (tests,
CSS-scope, icons, docs, cleanups) run **`code-reviewer` only**. One
consolidated fix-up round, **< 100 LOC**; do not stage round-2 reviews.

### Override E — DoD has a `verified` axis
Each DoD line has two checkboxes:
- `[d]` *declared*: shipped, CI green, reviewer(s) approved.
- `[v]` *verified*: exercised at closure per the per-issue `[v]`
  definition (see DoD section).

`[d]` ✓ is allowed mid-wave; `[v]` ✓ is **closure-only**.

### Override F — No inline UI string literals; pull from `lib/copy/*`
Every UI string is sourced from `lib/copy/*`. The CARRY PRs touch
existing rendered strings only through token/icon swaps — no new copy
literals are introduced. The #156 icon swap and #297 token swap change
*visual* tokens, not strings; any string they touch must already live in
`lib/copy/*`.

### Override G — `app/page.tsx` ownership at closure
Closure either updates `app/page.tsx` to reflect CARRY reality OR writes
a one-line explicit "kept as-is, decision: …" in the closure ADR.
Orphaning the landing page is out of bounds. (CARRY adds zero feature
surface, so "kept as-is" is the expected outcome — but it must be
**explicitly** recorded.)

### Override H — Single-file serialization on `notes/design-system.md`
Every write to `notes/design-system.md` is serialized — **never** run
parallel agents against the shared file. In CARRY, the drift-table
updates (1a, 1b, 1c) and the §Component-bindings update (2b) all write
this file; they merge in the dependency order the waves already impose
(1a → 1b → 1c → 2b), with **zero parallel PRs touching it**. PR-B opens
only after PR-A merges whenever both touch the doc.

### Override I — Wave worktree timing (add/add conflict avoidance)
Pre-create a wave's worktrees **only AFTER the preceding wave fully
merges**. Wave-2 worktrees are created only after Wave 1 is entirely on
`main`, so a later PR that re-touches a file a prior PR split does not
collide.

### CARRY-specific rulings (FINAL — do not re-litigate)

- **#155 is NOT self-merge-OK.** `security-reviewer` + `code-reviewer`
  dispatch in parallel, **plus** a non-organizer verification walk
  (member sees zero invites, organizer + co_organizer still see rows).
- **Wave-0 stress bar:** per-file **≥40× local loop** (shell loop — see
  Wave 0; vitest 4 has NO `--repeat` flag, and `--retry` is banned) + an
  **injected action-mock delay** to widen the race window
  deterministically + **≥5 consecutive green full-CI runs on the 0a PR
  head**. **No retry/skip config** — the fix is determinism, not masking.
  The injected delay is a **per-test local constant** (`await sleep(ms)`
  inside the mock) — NOT a shared configurable seam or mock-delay utility.
- **Drift-table discipline:** re-run the drift-table grep AND update the
  `notes/design-system.md` drift table **after EACH token-touching PR
  (1a, 1b, 1c)**. Override H serializes all `design-system.md` writes —
  no parallel PRs may touch it.
- **Wave-2 worktrees** are created only **after Wave 1 fully merges**
  (Override I — add/add conflict avoidance).
- **eslint 9→10 major (dependabot #271) is EXCLUDED** from the batch.
  Comment — *"deferred: verify flat-config compat with #182 custom
  rules first"* — and **leave it open.**
- **Never stage** `CLAUDE.md` / `notes/collaboration.md` working-tree
  WIP, or the `.claire/` / `.claude/` directories. Closure touches
  `CLAUDE.md` deliberately; the *pre-existing working-tree edits* to it
  and to `notes/collaboration.md` are NOT part of any CARRY PR.

---

## Reality check (state at CARRY start)

- **#230 flake locus:** `components/trip/__tests__/rsvp-toggle.test.tsx`
  (chronic flake near `:192`) is a `fireEvent`-driven async-submit race;
  three sibling suites share the same shape
  (`tests/unit/login-form.test.tsx`,
  `tests/unit/account-sign-in-and-security.test.tsx`,
  `components/trip/itinerary/__tests__/member-flag-picker.test.tsx`).
  The gap is a missing shared helper for "click then await settle." A
  new `tests/fixtures/dom.ts#clickAndSettle` closes that gap.
- **Token cascade (#297, #188):** the DS prod `<Identifier>` walk
  surfaced that `[data-theme=bachelor]` never binds `--destructive`, so
  Revoke renders a saturated default red, AND that the `:root` token
  block leaks into themed contexts because it is not scoped
  `:root:not([data-theme])`. Both live in `app/globals.css`.
- **Radius drift (#289 remainder):** the polar radius spec
  (`rounded-xs` 2px buttons/inputs, 8px cards/sheets/popovers,
  `rounded-full` chips/pills/avatars/badges) is not uniformly applied;
  the `--radius-xs` token landed in DS (#292) but the calc scale +
  call-site audit was deferred. Scope is unknown until audited → audit
  doc gates the decision.
- **`getNextUpcomingItem` (#157):** dead since the dashboard now/next
  card was rewired; lives at `lib/db/itinerary.ts:76-97` with its test
  at `lib/db/__tests__/itinerary.test.ts:168-196`. Verified present.
- **Announcements enrichment (#250):** an unused-param seam in
  `lib/db/announcements.ts` from a half-considered SQL-view path.
  **DECISION FINAL: keep the post-fetch map, NO SQL view** (2-dev MVP;
  revisit only if N+1 actually bites).
- **Itinerary icons (#156):** `components/trip/itinerary/item-card.tsx`
  uses emoji `KIND_ICON`; travel-leg-card already migrated to lucide but
  drifted to `strokeWidth 2`. The spec is **`strokeWidth 1.75`** — do
  NOT copy the drift.
- **Invites RLS (#155):** the SELECT policy
  *"members can see invites for their trips"* on `public.invites` is
  too broad — any member sees pending invites. Tightening to
  organizers-only via `public.is_trip_organizer(trip_id)`. Migrations
  through `20260522155912_trip_readiness_has_password.sql` are on `main`;
  `0001_init.sql:185-200` + `20260519191413_m2_trips_and_invites.sql:25-45`
  hold the current invites schema + policy.

**Schema reality:** unchanged except the single #155 SELECT-policy swap.
**CARRY adds exactly one RLS-only migration.** Any other SQL is a
hard-stop.

---

## Wave 0 — CI trust (1 PR + 1 dependabot; merge-blocker for everything)

**Hard merge-blocker before any Wave 1 or Wave 2 PR opens.** This wave
makes the suite trustworthy so the rest of the wave's green checks mean
something. Merge dependabot **#270 (vitest 4.1.6 → 4.1.8) FIRST** so the
stress proof runs on the shipped runner, then ship 0a.

| ID | Branch | Closes | Owns (files) | Tests claimed | Risk |
|---|---|---|---|---|---|
| **0a** | `fix/async-submit-flake` | #230, #207 | `tests/fixtures/dom.ts` (**new** — `clickAndSettle`, <15 lines), `components/trip/__tests__/rsvp-toggle.test.tsx`, `tests/unit/login-form.test.tsx`, `tests/unit/account-sign-in-and-security.test.tsx`, `components/trip/itinerary/__tests__/member-flag-picker.test.tsx` | the four edited suites above | medium |

**`clickAndSettle` contract (`tests/fixtures/dom.ts`, new, <15 lines):**
```
clickAndSettle(el): userEvent.setup() → await user.click(el)
  → await waitFor(() => expect(el).toBeEnabled())
```
Pure helper; no app import; deterministic settle on the re-enabled
submit control.

**Approach:**
- Migrate `fireEvent` → `userEvent` with **explicit awaits** in all four
  suites.
- Route every submit-click through `clickAndSettle`.
- **Inject a delay into the action mocks** to widen the race window
  deterministically (the race is real; the fix exposes then closes it
  rather than narrowing it by luck). The delay is a **per-test local
  constant** (`await sleep(ms)` inside the mock) — no config object, no
  shared injector, no mock-delay utility.
- Behavior under test is **unchanged** — only the test harness changes.

**Stress proof (document exact command + results in PR body):**
- Per-file shell loop **≥40×** locally, for each of the four suites.
  **vitest 4 has NO `--repeat` CLI flag** (and `--retry` is banned) —
  the verified mechanism is:
  ```
  for i in $(seq 1 40); do
    pnpm vitest run <file> || { echo "FLAKE on run $i"; exit 1; }
  done && echo "OK: 40/40 green"
  ```
- **CI stress = ≥5 consecutive green full-CI runs on the 0a PR head**
  (`gh run rerun` or empty commits; paste the run URLs in the PR body).
  No stress job exists in `ci.yml` — do not add one; reruns are the
  mechanism.
- **No retry/skip config** added anywhere.

**Dependabot:** merge **#270 (vitest 4.1.6 → 4.1.8) BEFORE 0a.**

**Gate to Wave 1 & Wave 2 (run AFTER #270 + 0a merge):**
```
pnpm typecheck && pnpm lint && pnpm test && pnpm build
grep -rEn "\b(describe|test|it)\(" app/ || echo "OK: no tests in app/"
# Re-run each migrated suite ≥40× locally — zero flakes (per suite):
for i in $(seq 1 40); do pnpm vitest run components/trip/__tests__/rsvp-toggle.test.tsx || { echo "FLAKE on run $i"; exit 1; }; done
# (repeat the loop for the other three suites)
# Confirm no retry/skip config crept in:
grep -rEn "retry|test\.skip|\.fixme" components/trip/__tests__/rsvp-toggle.test.tsx tests/unit/login-form.test.tsx tests/unit/account-sign-in-and-security.test.tsx components/trip/itinerary/__tests__/member-flag-picker.test.tsx || echo "OK: no retry/skip"
```
Wave 1 and Wave 2 stay closed until #270 + 0a are on `main`.

**Out of scope for Wave 0:** any source/behavior change, any new action,
any SQL, any retry/skip config.

**Risk: medium.** Four test files touched; the behavior under test is
unchanged, so the blast radius is the harness only. The injected-delay
seam is the one novel mechanism — keep it test-local.

---

## Wave 1 — token-cascade drift (3 sequential PRs; drift-grep after each)

Opens after Wave 0 merges. **Three sequential PRs.** Each is followed by
a drift-table re-grep AND a `notes/design-system.md` drift-table update
(Override H serializes the doc — these merge in order, never parallel).

| ID | Branch | Closes | Owns (files) | Tests claimed | Risk |
|---|---|---|---|---|---|
| **1a** | `fix/destructive-token-bachelor` | #297 | `app/globals.css` (add `--destructive` to `[data-theme=bachelor]`; do NOT bind `--destructive-foreground`), `notes/design-system.md` (drift-table row) | none | medium |
| **1b** | `fix/token-cascade-scope` | #188 | `app/globals.css` (scope `:root` token block to `:root:not([data-theme])`), `notes/design-system.md` (drift table) | none | medium |
| **1c** | `chore/radius-audit` | #289 (remainder) | `notes/radius-audit.md` (**new**); **if in-scope:** `app/globals.css` (calc scale) + the audited call sites; `notes/design-system.md` (drift table) | none | medium |

> **Serialization (Override H):** 1b opens only after 1a merges; 1c opens
> only after 1b merges. All three touch `notes/design-system.md`'s drift
> table. **Zero parallel agents on `app/globals.css` or
> `design-system.md`, ever.**

### 1a — `#297` bachelor `--destructive` binding

- Add `--destructive: oklch(0.62 0.12 35)` to the
  `[data-theme=bachelor]` block in `app/globals.css`.
- **Do NOT bind `--destructive-foreground`** — no solid-fill consumer
  exists; binding it now would be speculative.
- **Audit all `text-destructive` / `bg-destructive` call sites in
  `app/`** (≈10), including `login/_form.tsx:373`,
  `invite/[token]/page.tsx:134`, `trips/new/_form.tsx`, `dates/*`,
  `account/sign-in-and-security/_form.tsx:493`. **Classify each call
  site against its governing contract:** #210 destructive *verbs*
  (Revoke, Delete) correctly keep persimmon; #209 *error-surface text*
  (validation lines, `role="alert"` banners) is specced **ink shade +
  hairline, not persimmon** — log those as drift in the audit and
  **file one follow-up issue** (covering the repo-wide ~42 call sites
  incl. `components/trip/*`), do NOT re-style them in 1a. Confirm
  none depended on a saturated red.
- **Contrast (pre-verified):** 4.6:1 on card `#1a1517`, 5.0:1 on
  `#100C0F`.
- **Acceptance:** 375px preview/prod walk of the invites surface —
  **Revoke renders desaturated persimmon** (screenshot in PR body under
  `## Preview smoke (375px)`).
- **Then:** re-grep the drift table + update the `design-system.md`
  drift-table row.

### 1b — `#188` `:root` token-cascade scope leak

- Wrap the `:root` token block in `:root:not([data-theme])` so default
  tokens stop leaking into themed contexts.
- **Verification:** preview-deploy `getComputedStyle` checks (`body`
  background, `--card`, `--popover` under `[data-theme=bachelor]`) +
  **#217 visual baseline green** (regenerate `home.png` if the leak fix
  shifts it — document the regen in the PR body).
- **Then:** re-grep the drift table + update `design-system.md`.

### 1c — `#289` radius audit (re-scope trigger built in)

- Land `notes/radius-audit.md` (**new**) — a table:
  `file | rounded-* class | surface class | intended polar radius | change y/n`.
- **Decision rule:** buttons/inputs → `rounded-xs` (2px); cards / sheets
  / popovers → 8px; chips / pills / avatars / badges → `rounded-full`
  (stay).
- **RE-SCOPE TRIGGER:**
  - **If >6 call sites change visually** → land the audit doc + a
    `notes/decisions.md` ADR **only** this wave, file a follow-up issue
    for the call-site work, **close #289 as re-scoped.** (N=6 is the
    architect-ratified guideline; the audit itself is mandated by the
    #289-slice-1 ADR — do not skip the enumeration even if the grep
    looks small.)
  - **If ≤6** → the **same PR** changes the calc scale in
    `app/globals.css` **and** the call sites together; **#217 baseline +
    375px walks of affected surfaces** as the regression guard.
    Regenerate `home.png` in this PR if the scale change shifts it
    (second regen after 1b's is expected and fine — serialized order
    makes it deterministic).
- **If re-scoped:** the follow-up issue is a gate artifact — the Wave-1
  gate below verifies it exists by number.
- **Then:** re-grep the drift table + update `design-system.md`.

**Verification gate after Wave 1:**
```
pnpm typecheck && pnpm lint && pnpm test && pnpm build
grep -rEn "\b(describe|test|it)\(" app/ || echo "OK: no tests in app/"
# Drift-table grep (must reconcile globals.css ∩ design-system.md tokens):
grep -nE "--destructive|--radius|:root" app/globals.css
grep -n "drift" notes/design-system.md
# #188 leak audit — default tokens should NOT apply under a theme:
#   getComputedStyle(body) under [data-theme=bachelor] on the preview
#   (kept alongside #217 — the baseline only covers home.png; --card/
#    --popover leaks on other surfaces are invisible to it)
# #217 baseline green (regenerate home.png only if 1b/1c shifted it)
pnpm exec playwright test --config=playwright.visual.config.ts
# If 1c re-scoped #289: the follow-up issue must exist by number:
gh issue list --search "radius call-site" --json number,title
# If 1a logged #209 error-surface drift: that follow-up must exist too:
gh issue list --search "error-surface persimmon" --json number,title
```
**Risk: medium.** All three touch global tokens — the blast radius is
every themed surface. The drift-table-after-each-PR discipline + #217
baseline are the containment.

---

## Wave 2 — small carry-backs (parallel after Wave 1; self-merge-OK EXCEPT #155)

Opens after Wave 1 **fully** merges (Override I — worktrees created only
then). Five PRs, **distinct files, parallel-eligible**. **All self-merge-
OK EXCEPT 2e (#155).** Dependabot batch runs alongside.

| ID | Branch | Closes | Owns (files) | Tests claimed | Self-merge | Risk |
|---|---|---|---|---|---|---|
| **2a** | `chore/delete-get-next-upcoming-item` | #157 | `lib/db/itinerary.ts:76-97`, `lib/db/__tests__/itinerary.test.ts:168-196` | edited itinerary test | **OK** | low |
| **2b** | `refactor/announcements-enrichment-decision` | #250 | `lib/db/announcements.ts` (clean the unused-param seam), announcements page (only if signature changes), `notes/design-system.md` §Component-bindings row, `notes/decisions.md` mini-ADR | existing announcements tests (+1 if signature changes) | **OK** | low |
| **2c** | `docs/account-actions-has-password-note` | #245 | `tests/unit/account-actions.test.ts` (comment block) **or** `notes/` doc per the issue | none | **OK** | low |
| **2d** | `chore/itinerary-lucide-icons` | #156 | `components/trip/itinerary/item-card.tsx` (`KIND_ICON` emoji → lucide), eslint exemption removal if one exists for this file | edited item-card test if present | **OK** | low |
| **2e** | `chore/invites-rls-organizers-only` | #155 | `supabase/migrations/20260609HHMMSS_carry_invites_select_organizers_only.sql` (**new**) | n/a (RLS) | **NOT** | medium |

**Coordination rule:** zero file overlap. 2a owns `lib/db/itinerary*`;
2b owns `lib/db/announcements.ts` (+ the `design-system.md`
§Component-bindings row, serialized **after 1c merges** — true by
construction); 2c owns its single test/doc; 2d owns `item-card.tsx`;
2e owns the new migration. **Override H:** 2b's `design-system.md` write
runs after every Wave-1 `design-system.md` write has merged — no
parallel writer.

### 2a — `#157` delete dead `getNextUpcomingItem`
Trivial. Delete `lib/db/itinerary.ts:76-97` and its test at
`lib/db/__tests__/itinerary.test.ts:168-196`. **Self-merge OK.**

### 2b — `#250` announcements enrichment decision (FINAL)
**DECISION FINAL: keep the post-fetch map, NO SQL view** (2-dev MVP;
revisit only if N+1 bites). Clean up the unused-param seam in
`lib/db/announcements.ts`; touch the announcements page only if the
signature changes. Update the `notes/design-system.md`
§Component-bindings row (serialized — scheduled after 1c by
construction) and append a `notes/decisions.md` mini-ADR recording the
keep-the-map decision. Existing announcements tests must pass; add one
only if the signature changes. **Self-merge OK.**

### 2c — `#245` has_password test note
Trivial doc/comment per the issue — a comment block in
`tests/unit/account-actions.test.ts` **or** a `notes/` doc.
**Self-merge OK.**

### 2d — `#156` itinerary lucide icons
Swap `KIND_ICON` emoji → lucide in
`components/trip/itinerary/item-card.tsx`. **`strokeWidth 1.75` per spec
— do NOT copy travel-leg-card's `strokeWidth 2` drift.** Keep
`aria-hidden` parity; `h-4 w-4`. This closes a **rule-(b) anti-tell
exemption** — also **remove the eslint exemption** if one exists for
this file. **Acceptance:** 375px preview screenshot of an itinerary card
in PR body (`## Preview smoke (375px)`). **Self-merge OK** — per
`collaboration.md`, self-merge on UI tweaks means *flagged in the PR
body + other-dev ack in a comment*, not unilateral; flag it and give
Carl the chance to ack.

### 2e — `#155` invites RLS organizers-only (NOT self-merge)
New migration
`supabase/migrations/20260609HHMMSS_carry_invites_select_organizers_only.sql`:
- `drop policy "members can see invites for their trips" on public.invites;`
- `create policy "organizers can see invites for their trips"` for
  `select` to `authenticated` using
  `public.is_trip_organizer(trip_id)`.

**Local `pnpm dlx supabase db reset` proof in the PR body.**
`security-reviewer` + `code-reviewer` **in parallel** (Override D).
**Verification walk** (executor: the agent, via MCP Playwright against
local/preview with seeded personas): a non-organizer member sees **zero
invites** (empty state, no error); an **organizer + co_organizer** still
see rows. **NOT self-merge** — needs the other dev's review.

**Staging auto-pause pre-check (BEFORE merging 2e):** main's
`supabase db push` job fails if the free-tier staging project is paused
(idle ≥1 week). Verify staging is awake before merge (e.g. MCP
`get_project` status). If paused: **STOP and surface to Carl** — only
he can run the restore curl (the CLI has no restore command; see project
memory `staging-supabase-auto-pause`). Do not merge 2e onto a paused
staging.

**Dependabot batch (alongside Wave 2):**
- **#270** already merged in Wave 0.
- Merge **#265, #266, #267, #268, #269, #272 individually after CI
  green.** Note: **#265 (`upload-artifact@v7`) must cover BOTH `ci.yml`
  and `visual.yml`** — verify both workflows are bumped.
- **#271 (eslint 10) DEFERRED** — comment *"deferred: verify flat-config
  compat with #182 custom rules first"*; **leave open.**

**Verification gate after Wave 2:**
```
pnpm dlx supabase db reset            # #155 migration applies clean
pnpm typecheck && pnpm lint && pnpm test && pnpm build
grep -rEn "\b(describe|test|it)\(" app/ || echo "OK: no tests in app/"
# #157 dead-code gone:
grep -rn "getNextUpcomingItem" lib/ components/ app/ || echo "OK: removed"
# #155 RLS walk (manual, on preview/local):
#   member       → /trips/<id>/invites lists ZERO invites, empty state, no error
#   organizer    → sees rows
#   co_organizer → sees rows
# #156 375px itinerary-card screenshot in PR body
# Dependabot: #265 bumps BOTH ci.yml and visual.yml
grep -rn "upload-artifact@v7" .github/workflows/ci.yml .github/workflows/visual.yml
```
**Risk: medium (2e — RLS), low (2a–2d).** 2e is the only
security-sensitive change; the parallel reviewers + the three-persona
walk de-risk it.

---

## DoD checklist (source of truth — check as work lands)

Two axes per Override E. `[v]` ticked at closure only. `[v]` definitions
per issue are recorded inline.

**Wave 0 — CI trust**
- [x]d [x]v #230 rsvp-toggle async-submit flake fixed via `clickAndSettle` (PR 0a) — `[v]` = **40× per-file stress + one full CI run green post-merge**
- [x]d [x]v #207 shared async-submit harness across the four suites (PR 0a) — `[v]` = **40× per-file stress + one full CI run green post-merge**
- [x]d [x]v dependabot #270 vitest 4.1.6 → 4.1.8 merged **before** 0a stress proof

**Wave 1 — token-cascade drift**
- [x]d [x]v #297 bachelor `--destructive` bound (no `--destructive-foreground`); ≈10 call sites audited (PR 1a) — `[v]` = **prod/preview invites walk screenshot (Revoke = desaturated persimmon)**
- [x]d [x]v #188 `:root` token block scoped `:root:not([data-theme])` (PR 1b) — `[v]` = **computed-style checks on preview (body bg, `--card`, `--popover` under bachelor) + #217 baseline green**
- [x]d [x]v #289 radius audit doc landed; in-scope (≤6) calc-scale + call sites OR re-scoped (>6) with follow-up issue (PR 1c) — `[v]` = **audit doc merged + (if in-scope) #217 baseline green + 375px walks**

**Wave 2 — small carry-backs**
- [x]d [x]v #157 `getNextUpcomingItem` + its test deleted (PR 2a) — `[v]` = **CI green + grep proof (no surface, no `[v]` walk)**
- [x]d [x]v #250 announcements enrichment — keep post-fetch map, NO SQL view; seam cleaned; ADR + bindings row (PR 2b) — `[v]` = **CI green + grep proof (no surface, no `[v]` walk)**
- [x]d [x]v #245 has_password test note (PR 2c) — `[v]` = **CI green + grep proof (no surface, no `[v]` walk)**
- [x]d [x]v #156 itinerary `KIND_ICON` → lucide, `strokeWidth 1.75`, eslint exemption removed (PR 2d) — `[v]` = **375px itinerary-card screenshot**
- [x]d [x]v #155 invites SELECT policy → organizers-only via `is_trip_organizer` (PR 2e) — `[v]` = **RLS walk as member (zero invites) + organizer + co_organizer (rows visible)**

**Dependabot**
- [x]d [x]v #265 `upload-artifact@v7` — `visual.yml` is the ONLY upload-artifact consumer (ci.yml has none); verified + merged
- [x]d [x]v #266 / #267 / #268 / #272 merged individually after CI green; #269 superseded by dependabot mid-wave → **#299** (supabase group), deferred on the minimum-release-age supply-chain policy (packages too fresh; merge after aging)
- [x]d [x]v #271 eslint 10 — deferral comment posted; dependabot then CLOSED #271 itself, superseding it with **#298** (lint-format group, same eslint major) which carries the deferral comment and stays open

**Process / closure**
- [x]d [x]v `app/page.tsx` — **kept as-is** (zero feature surface; recorded in closure ADR, Override G)
- [x]d [x]v `notes/retros/carry-retro.md` authored (two-lens per pattern)
- [x]d [x]v `notes/decisions.md` "CARRY — milestone closed" ADR appended
- [x]d [x]v `CLAUDE.md` "Current phase" + carry-forwards list updated; gate STILL in place
- [x]d [x]v #255 flagged to Carl at closure (needs his OTP walk — out of scope here)

---

## Closure wave checklist

Single branch: `chore/carry-done`. Single PR.

**Touches:**
- `CLAUDE.md` — update "Current phase" to record CARRY shipped **WITH
  the real-trip gate STILL in place**, and update the carry-forwards
  list (remove the items CARRY closed: #230, #207, #297, #188, #289,
  #155, #156, #157, #245, #250).
- `notes/decisions.md` — append **"CARRY — milestone closed"** ADR at
  the top: the load-bearing decisions (announcements keep-the-map / no
  SQL view; #289 in-scope-vs-re-scoped outcome; `--destructive-foreground`
  left unbound; eslint-10 deferred) **and the explicit statement:
  "CARRY shipped WITH the real-trip retro gate STILL in place; M6
  features remain gated."**
- `notes/retros/carry-retro.md` (**new**) — two reconciled lenses per
  pattern (the DS/M3 retro shape: TL;DR, what shipped, what slipped,
  follow-up triage, process learnings).
- `app/page.tsx` — Override G check; expected outcome **kept as-is**
  (zero feature surface), recorded in the closure ADR.
- `notes/carry-execution-plan.md` (this file) — tick `[d]` and `[v]`.

**Closure-deviation note (do NOT):**
- Do **NOT** mark a roadmap milestone done — **roadmap note is N/A**
  (no §CARRY section; the ADR is the record, per DS precedent).
- Do **NOT** claim the real-trip gate is lifted.
- Do **NOT** flip any M6 surface to reachable.
- Do **NOT** stage the pre-existing working-tree edits to `CLAUDE.md` /
  `notes/collaboration.md`, nor the `.claire/` / `.claude/` dirs.

**Final CARRY gate:**
```
1. Local green: pnpm typecheck && pnpm lint && pnpm test && pnpm dlx supabase db reset && pnpm build
2. Test-in-app check: grep -rEn "\b(describe|test|it)\(" app/ → 0 lines
3. Drift-table re-grep: globals.css token names ∩ design-system.md drift table reconcile clean
4. One stress-loop re-run: each of the four 0a suites ≥40× → zero flakes
5. Issue queue empty: gh issue list --milestone "CARRY — CI-trust & token-drift" --state open
   → only #271 (eslint 10, intentionally deferred — unmilestoned) and #255 (flagged to Carl) remain
6. Milestone #8 closed
```

**Verification walks at closure (per-issue `[v]`):**
- **#230 / #207** — 40× per-file stress + one full CI run green
  post-merge.
- **#297** — prod/preview invites walk screenshot (Revoke = desaturated
  persimmon).
- **#188** — computed-style checks on the preview.
- **#289** — audit doc merged + (if in-scope) #217 baseline green +
  375px walks.
- **#156** — 375px itinerary-card screenshot.
- **#155** — RLS walk as member (zero invites) + organizer +
  co_organizer (rows visible).
- **#157 / #245 / #250** — CI green + grep proof; **no `[v]` walk** (no
  surface).

**Flag at closure:** **#255** (fresh OTP-only walk for #233 State B
`[v]`) needs Carl's OTP walk — **out of scope here.** Surface it to Carl
in the closure PR body.

---

## Per-wave reading list (3–5 files max per wave's agent)

**Wave 0 (CI trust):**
1. The **#230 issue thread** (flake history + locus at `rsvp-toggle.test.tsx:192`)
2. `components/trip/__tests__/rsvp-toggle.test.tsx`
3. `tests/unit/login-form.test.tsx` + `tests/unit/account-sign-in-and-security.test.tsx`
4. `components/trip/itinerary/__tests__/member-flag-picker.test.tsx`
5. `components/trip/rsvp-toggle.tsx` (component under test — for the re-enable settle point)

**Wave 1 (token-cascade drift):**
1. `notes/design-system.md` §State signals + §Radius + the drift table
2. `app/globals.css` (`:root` + `[data-theme=bachelor]` token blocks)
3. The **#297 / #188 / #289 issue threads**

**Wave 2 (carry-backs) — 2e (#155) RLS reading list:**
1. `supabase/migrations/0001_init.sql:185-200` (invites schema)
2. `supabase/migrations/20260519191413_m2_trips_and_invites.sql:25-45` (current invites policy)
3. `notes/database-workflow.md` (migration discipline + env split)

> Wave-2 trivial PRs (2a/2c) need only their own file + the issue thread;
> 2b reads `lib/db/announcements.ts` + the announcements page; 2d reads
> `components/trip/itinerary/item-card.tsx` + `components/trip/arrivals/travel-leg-card.tsx`
> (the `strokeWidth 2` drift to NOT copy).

---

## Appendix — Per-wave hard-stop conditions

- 150 turns OR 2 consecutive wave-gate failures OR **any SQL/migration
  beyond #155's single-policy swap** OR new dependency request → STOP and
  surface.
- **Wave 0:** 1 gate failure → stop (CI trust blocks everything). If a
  migrated suite still flakes after the injected-delay seam → stop, do
  NOT add retry/skip.
- **Wave 1:** Override H is non-negotiable — a parallel-agent collision
  on `app/globals.css` or `design-system.md` → stop, re-serialize. If
  the #289 audit shows >6 call sites → execute the re-scope branch
  (doc + ADR + follow-up issue), do NOT expand the PR.
- **Wave 2:** `security-reviewer` re-rejecting #155 after the fix-up
  round → stop. Wave-2 worktrees created before Wave 1 fully merged →
  stop (Override I violation).
- **Closure:** failed #155 RLS walk OR a stress-loop flake at closure →
  fix-then-retry once, then stop.

## New dependencies this wave introduces

**One, user-approved 2026-06-09:** `@testing-library/user-event ^14.6.1`
(devDependency, PR 0a). The ratified Wave-0 approach (`userEvent.setup()`
in `clickAndSettle`) requires it; the original "zero new dependencies"
claim here was a planner contradiction, surfaced as a hard-stop and
approved by Carl before the 0a PR opened. Dev-only; passes the
supply-chain release-age policy.

Otherwise: dependabot bumps only (vitest #270; actions/misc #265–#269,
#272), one RLS-only migration, test-harness changes, CSS token scoping,
a lucide icon swap (lucide already in the dep tree), and docs.
**#271 (eslint 10) is explicitly deferred, not merged.** Any further
agent-introduced new dependency remains a hard-stop.

**Estimated totals:** 9 PRs (0a; 1a/1b/1c; 2a/2b/2c/2d/2e) + 7 dependabot
merges (#270 in Wave 0; #265/#266/#267/#268/#269/#272 in Wave 2) + 1
deferred (#271). Plus the closure PR.
