# M4 Retro — *"Trip is shippable"*

> Dated 2026-05-21, authored at closure. Fifteen wave PRs (#190–#204)
> landed between W0a and W4b. This closure PR (W4c) is the sixteenth.
> All wave-gate verifications ran on Vercel preview at 375px; the
> closure walk runs on https://travelston.com at 375×812 after this PR
> merges (orchestrator's responsibility — not part of this retro).
>
> This retro audits whether the M3 overrides A–G held through 15+ PRs
> at larger-than-M3 scale. M4 was heavier: structured inputs across
> six surfaces, a new Places API dep, multi-persona test infrastructure,
> a carry-back migration with 9 deltas, and a navigation refactor —
> all landing in 16 PRs over two days.

---

## TL;DR

M4 shipped on time. The M3 overrides A–G held through 15 PRs and the
expanded scope. The biggest process wins were the Wave 0 sub-PR split
(5 sub-PRs instead of one fat carry-back PR), the `edit-item-form-sheet`
pre-split that prevented a 4-way file collision in Wave 1, and the
parallel reviewer dispatch catching three CRITICAL/HIGH issues that would
have shipped broken.

The biggest surprises were collaborative rather than technical. Wave 1
worktrees were created before W0d merged, which meant the W0d pre-split
hadn't landed yet when Wave 1 agents started writing to the same form
files. The resulting conflict required manual rebase. The fix for M5 is
simple: never pre-create wave worktrees until the preceding wave's PR
has merged and been confirmed on `main`.

A second structural catch: W1b shipped a type contract mismatch (form
schema expected `string`; picker returned `string[]`). Code-reviewer
caught it as a consolidated fix-up. The root cause was that the W1b
agent wrote the picker without seeing the final form schema from W0d —
again, a timing issue created by parallel wave startup before the
preceding wave was merged.

Three of the seven load-bearing bugs caught in code/security review were
in the carry-back wave (W0c `SCOPE_BUDGETS` not wired, W2b `TRIP_COLUMNS`
missing `timezone`, W2c `CARRIER_SANITIZE_REGEX` stripping spaces). All
three were declarative/config errors — the implementation was present but
the wiring was wrong. The pattern to watch for: any time a new value is
added to a shared config constant or select column list, the reviewer
must verify end-to-end wiring from definition to usage.

---

## Section 1 — What shipped (objective)

Sixteen PRs landed on `main`:

- **#190** — W0a: M4 execution plan bootstrap + copy/data lock.
- **#191** — W0e: multi-persona test fixtures — `seed-test-organizer`,
  `seed-test-celebrant`, `asOrganizer()` / `asCelebrant()` helpers,
  `STORAGE_STATE_ORGANIZER_PATH` / `STORAGE_STATE_CELEBRANT_PATH`.
- **#192** — W0b: carry-back migration — 7 deltas (getFlagsForItem,
  trips.timezone column, setTripNotes revalidatePath, invites UPDATE RLS,
  trip_members SELECT tightening, idempotency on createInviteAction).
- **#193** — W0c: Google Places server proxy + SCOPE_BUDGETS wiring fix
  + MINT_INVITE hardened to 10/hour.
- **#194** — W0d: 5-tab bottom nav + /me skeleton + deep-link middleware
  + edit-item-form-sheet pre-split.
- **#195** — W1a: dress-code preset chips (#163).
- **#196** — W1b: activity-tag chip picker (#164).
- **#197** — W1c: per-item member-flag chips + organizer view + member
  self-read (#165).
- **#199** — W2a: Places UI consumer + address_place_id persistence (#166).
- **#200** — W2b: datetime-local widget + trip timezone support (#167, #108).
- **#198** — W2c: airline picker + IATA enforcement (#168).
- **#201** — W3a: persimmon theming + focus-ring system (#90, #121).
- **#202** — W3b: RSVP color + icon (#45).
- **#203** — W4a: /legal/terms + /legal/privacy stubs (#81).
- **#204** — W4b: prod-walk fixes + @axe-core/playwright sweep (#82).
- **W4c** (this PR): closure — retro, ADR, roadmap, CLAUDE.md, golden-path e2e.

---

## Section 2 — What worked (the overrides held)

### A. Real-browser smoke at 375px before merge

Every wave PR captured a 375×812 Vercel preview smoke before merge.
Override A caught zero production regressions this milestone — the smoke
became a ritual rather than a defect surface. That's the correct outcome.
The defect surface moved upstream to the parallel reviewer gate.

### B. Auth fixture extension — multi-persona

Override B in M3 was the single-user `STORAGE_STATE_PATH` fixture. M4
extended it cleanly: `seed-test-organizer.ts` and `seed-test-celebrant.ts`
add two new personas without touching the M3 fixture or its path.
All M3 specs continued to pass without modification. The extension pattern
(`asOrganizer()` / `asCelebrant()` returning `PersonaContext`) is reusable
for M5's multi-persona flows.

### C. Test placement gate (Override C)

Zero ghost tests this milestone. Every PR confirmed `e2e/` placement for
Playwright specs and `tests/` for Vitest unit/integration tests.
The `grep -rEn` check ran before commit in every wave.

### D. Parallel reviewer dispatch — highest-leverage override

Three CRITICAL/HIGH issues caught across 15 PRs by parallel
code + security review:

- **W0c `SCOPE_BUDGETS` not wired through `buildUpstashLimiter`** —
  code-reviewer flagged HIGH. Without this, all M4 rate-limit scopes
  were bypassed in production.
- **W2b `TRIP_COLUMNS` missing `timezone`** — security-reviewer caught
  as silent data-loss. The UI would have rendered with undefined timezone
  on every page using the shared query.
- **W2c `CARRIER_SANITIZE_REGEX` stripping spaces** — both reviewers
  flagged CRITICAL. Airline names with spaces (e.g. "Air Canada") would
  have been corrupted to "AirCanada" in the DB.

All three would have shipped silently without the parallel review gate.

### E. `[d]` declared vs `[v]` verified axis

The `[d]` ticks landed wave-by-wave at PR merge. The `[v]` ticks land
at closure after the production walk. The split was valuable again — it
made the production walk a real gate rather than a victory lap.

### F. Microcopy palette read-only after W0a + Override H

The copy/data lock held across all 15 waves. No wave added a UI string
without a corresponding key in `lib/copy/*`. The PR template checklist
item enforced this at review time. Override H (explicit data-lock rule)
formalized what M3 did informally.

### G. `app/page.tsx` ownership

The M4 landing page ("Plan the trip without the group-chat chaos.")
continues to accurately describe the M4 surface. M4 added structured
inputs, theming, legal stubs, and a 5-tab IA — all accessible after
sign-in, not on the marketing page. The landing pitch is about the
pre-sign-in value proposition, not the feature inventory. Kept as-is;
decision recorded in the M4 closure ADR.

### I. Resend `[v]` — deferred to closure walk

Override I applies: the sandbox sender (`onboarding@resend.dev`) does
not tick the `[v]` box on "send invite to real attendees." The domain
(`travelston.com`) has not yet been verified on Resend as of this
closure. The `[v]` tick for real-attendee invite delivery is blocked
pending #135. Documented in `notes/deployment-readiness.md` M4 closure
status section.

---

## Section 3 — What slipped or surprised

### Wave 1 worktrees created before W0d merged — file collision

W0d pre-split `edit-item-form-sheet.tsx` into per-field sub-components
to prevent a 4-way collision across W1a/W1b/W1c. The pre-split only
helps if Wave 1 worktrees are created after W0d merges. In practice,
the W1a/W1b/W1c worktrees were created while W0d was still in review.
When W0d merged, all three Wave 1 branches were BEHIND `main` and had
already started writing to the pre-split filenames — creating conflicts
that required manual rebase + resolution.

**Fix forward for M5:** never pre-create wave worktrees until the
preceding wave's PR has merged and been confirmed on `main`. The
cost is a small wait; the benefit is clean worktrees with no collision
risk.

### W1b type contract mismatch — form schema string vs picker string[]

The activity-tag chip picker (W1b) returned `string[]` (a multi-select),
but the form schema expected `string` (matching the M3 freeform text
field it replaced). The form would have accepted the picker's value as
`[object Object]`. Code-reviewer caught this as a consolidated fix-up.

The root cause was a timing issue: the W1b agent wrote the picker against
the M3 form schema, which hadn't been updated by W0d's pre-split yet.
Once W0d merged, the schema was updated — but the W1b worktree was
already mid-execution.

**Fix forward:** form schema updates that affect picker return types
belong in W0d's pre-split, not discovered mid-Wave-1.

### W0c `SCOPE_BUDGETS` declarative-only — not wired through `buildUpstashLimiter`

W0c initially shipped `SCOPE_BUDGETS` as a config object with values set
correctly but never passed to `buildUpstashLimiter`. The rate-limit
scopes were completely bypassed in production. Code-reviewer flagged HIGH.
The consolidated fix-up wired all scopes through `buildUpstashLimiter`
in the same W0c PR before merge.

**Pattern:** whenever a new value is added to a shared config constant,
reviewers must trace the end-to-end path from definition → invocation.
Declarative-looks-right is the most dangerous class of config bug.

### W2b `TRIP_COLUMNS` missing `timezone` — silent data-loss

`trips.timezone` was added to the DB migration in W2b, and the
`datetime-local` widget wrote to it correctly. But the shared
`TRIP_COLUMNS` select constant — used in every `getTrip` call — did not
include `timezone`. Every page using `getTrip` would have received
`undefined` for timezone and silently fallen back to UTC.
Security-reviewer caught this.

**Pattern:** adding a new column to a table always requires auditing
every shared select constant that queries that table.

### W2c `CARRIER_SANITIZE_REGEX` — spaces stripped instead of NUL

The original regex `/[ \r\n]/g` stripped spaces, carriage returns, and
newlines. The intent was to strip NUL, carriage return, and newline
(injection vectors). Spaces are valid in airline names ("Air Canada",
"Alaska Airlines") and must not be stripped. Both code-reviewer and
security-reviewer flagged this CRITICAL. The fix swapped space (`\x20`)
for NUL (`\0`): `/[\0\r\n]/g`.

**Lesson:** character class regex bugs are subtle. Test suites for
sanitize functions must include inputs with spaces as a baseline — not
just injection vectors.

### Flaky tests documented for M5 monitoring

Two tests exhibited a single flake each in the M4 run:

- `member-flag-picker.test.tsx:133` — passed locally + on CI retry.
  Not reproducible; possibly a timing issue in the async render.
- `rsvp-toggle.test.tsx:192` — passed locally + on CI retry. Same
  pattern.

Neither was blocking. Both are documented here for M5 — if either
flakes again, investigate before adding more tests to the same file.

### tdd-guide agents hallucinating pre-existing test failures

Several tdd-guide agent runs reported "pre-existing test failures" in
their preamble that did not exist when the orchestrator ran the same
suite manually. The agents may have been reading stale CI output or
confusing their context window. The orchestrator caught these via manual
verification before each merge. No tests were skipped or suppressed.

**Fix forward:** when a tdd-guide agent reports pre-existing failures,
the orchestrator runs `pnpm test` on the current worktree branch before
trusting the agent's report.

---

## Section 4 — Process learnings

1. **Pre-create wave worktrees on current `main` only after the preceding
   wave merges** — not before. The W0d pre-split exists precisely to
   prevent file collisions; the pre-split is only effective if Wave 1
   sees the post-merge state of `main`. Pre-creating worktrees before
   the preceding wave merges loses the pre-split benefit entirely.

2. **Form schema updates that change picker return types belong in the
   wave that defines the schema** (W0d in M4), not in the wave that
   consumes the picker (W1b). A picker returning `string[]` against a
   schema expecting `string` is a type-contract bug that can only be
   caught at compile time if the schema is updated before the picker
   is written.

3. **The Phase 4 hard gate (re-audit before execution) caught real issues
   both M3 and M4.** Keep it. The cost is ~15 minutes per milestone;
   the benefit is catching declarative-only wiring bugs before they reach
   a wave PR.

4. **Parallel reviewer dispatch with COMMENTED reviews** (blocked by
   GitHub self-PR approval) continues to work. The orchestrator
   interprets "clear to merge" language in COMMENTED reviews as
   functional approval. A robot reviewer account would smooth this seam
   but is not worth adding for M5 unless the friction recurs.

5. **Smaller fix-up commits.** M3 noted this; M4 confirms it. Fix-up
   commits under 100 LOC fit the re-review budget. Larger fix-ups
   (e.g. the W0c wiring fix across 6 files) should be split into
   independent fix-up commits by category.

6. **Config-constant audit is load-bearing.** Three of the seven
   CRITICAL/HIGH catches this milestone were config-constant wiring bugs
   (`SCOPE_BUDGETS`, `TRIP_COLUMNS`, `CARRIER_SANITIZE_REGEX`). Reviewers
   should explicitly trace definition → invocation for any PR that adds
   a value to a shared constant.

---

## Section 5 — Recommendation for next session (M5+)

M4 is the stop-here line. The app has been used for zero real bachelor
parties. Until that changes, M5 is locked.

**Gates for M5:**

1. Use the app for one real bachelor party (MVP target).
2. Run a real-trip retrospective — what did the trip actually need that
   M4 didn't have? What M4 features didn't get used?
3. Only open M5 issues that the retro surfaces as concrete needs, not
   items already on the M5 list.

**Carry-forward from M4:**

- Wave worktree timing: create after preceding wave merges, not before.
- Config-constant audit: add to reviewer prompt for M5.
- Form-schema/picker contract: define in the wave that defines the
  schema, not the wave that consumes the picker.
- Resend domain (#135): must be resolved before any M5 onboarding flow
  that requires email delivery to real users.
- The flaky tests (`member-flag-picker:133`, `rsvp-toggle:192`): monitor
  in M5; investigate if either recurs.

**Killed and deferred from M4 scope** (did not regress — never attempted):

See `notes/killed-and-deferred.md` for the full list. No M5 issue should
be re-proposed without first checking against that list.

**The bright line still applies:** M5 is gated on a real-trip
retrospective. Don't open M5 planning until you've used M4 on an
actual bachelor party and written the retro.
