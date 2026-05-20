# M3 Retro — *"Trip is useful"*

> Dated 2026-05-20, authored at closure. Nine PRs landed between
> `f86c160` (Wave 0a) and the closure PR. All wave-gate verifications
> ran on the Vercel preview at 375px; the closure walk ran on
> https://travelston.com at 375x812.
>
> This retro is shorter than M2's by design: M2 caught a P0 in production
> after declaration-only DoD. M3's overrides (A–G) closed that loop, so
> the entire retro is about how the new discipline held up under load.

---

## TL;DR

M3 shipped on time. Five process overrides from M2-retro §5+§6 held
through nine PRs and ~430 net new tests. The biggest wins:

- **Override A (real-browser smoke at 375px before merge)** — caught
  zero defects this milestone. The screenshots became a ritual rather
  than a defect surface; that's the right outcome of a healthy gate.
- **Override D (security + code reviewers in parallel)** — caught the
  two most consequential issues of the milestone (vCard CRLF injection,
  silent revoke RLS no-op). Independent attention to the same surface
  beats sequential review even when both reviewers are the same model.
- **Override F (microcopy palette read-only after Wave 0a)** — held
  with one explicit exception (Wave 4a + 4b each added arrivals/roster
  badge keys after code-review flagged inline literals). The exception
  pattern is documented; the read-only rule still works.

The pain points were budget-shaped, not design-shaped: parallel agent
dispatches exhausted the session-rate budget twice during Wave 4
re-reviews. The fix is smaller fix-up commits, not changing the override.

---

## Section 1 — What shipped (objective)

Nine PRs landed on `main`:

- **#143** — Wave 0a bootstrap: plan doc + deployment-readiness +
  `lib/copy/*` M3 keys.
- **#145** — Wave 0b: Playwright `storage-state` auth fixture (#120).
- **#144** — Wave 0c: PKCE → token-hash callback for cross-device
  magic-link clicks (#137).
- **#146** — Wave 1: `m3_itinerary_announcements` migration + data
  layer + seven idempotent server actions.
- **#147** — Wave 2: itinerary UI + per-item RSVP chip + per-item
  flag form. Lodging-assignment UI (#36).
- **#148** — Wave 3a: announcements page + Realtime feed (#79).
- **#149** — Wave 3b: now/next dashboard card + trip notes editor +
  `revalidatePath` on `setRsvpAction` success.
- **#150** — Wave 4a: arrivals manifest + travel-leg form (#37).
- **#151** — Wave 4b: roster page + vCard mass-download + copy-numbers.
- **#152** — Wave 4c: invite-issuance UI + `MINT_INVITE` rate-limit
  scope split.

Total net new tests: ~432 added. Final suite: ~445 tests.

---

## Section 2 — What worked (the overrides held)

### A. Real-browser smoke at 375px before merge

Every wave PR captured a 375×812 MCP-Playwright smoke against the
Vercel preview before merge. Zero defects surfaced from those smokes
this milestone. That's not the override failing — it's the override
working. The defect surface moved upstream into the parallel reviewer
gate, which is the right place for it.

### B. Auth fixture (#120) was the right Wave-0 investment

Wave 1+ e2e specs use `tests/fixtures/auth.ts` and
`STORAGE_STATE_PATH` directly. No wave had to write a bespoke login
flow.

### C. Test placement gate

Zero ghost tests this milestone. Every PR ran the `grep -rEn` check
before commit; vitest's exclude glob did its job.

### D. Parallel reviewer dispatch — highest-leverage override

Independent attention from the same model to the same surface catches
different things:

- **vCard CRLF injection (Wave 4b)** — both reviewers flagged HIGH in
  their first pass. Either alone would have caught it; the parallel
  dispatch made the catch redundant (and more confident).
- **Silent revoke RLS no-op (Wave 4c)** — security caught it, code
  didn't. Sequential review would have missed this unless security
  ran first.
- **CRITICAL TZ drift (Wave 4a)** — code caught it, security didn't
  flag (correctly — it's a correctness bug, not a security one).

GitHub blocks self-PR approval, so reviewers posted COMMENTED reviews
with explicit "clear to merge" language. The orchestrator interpreted
those as approval. Worked, but a robot-account would smooth the seam.

### E. `[d]` declared vs `[v]` verified axis

The `[d]` ticks landed wave-by-wave; the `[v]` ticks landed at closure
after the production walk. The split was useful — it made the
production walk feel like a real gate rather than a victory lap.

### F. Microcopy palette read-only after Wave 0a

Held. Two waves (4a + 4b) needed to add badge keys after code-review
flagged inline literals; both did so as part of the consolidated
fix-up round, with the deviation noted in the PR.

### G. `app/page.tsx` ownership

Explicit kept-as-is decision recorded in the M3 closure entry. The
landing page written for M2 still accurately describes the M3
surface.

---

## Section 3 — What slipped or surprised

### Session-budget exhaustion during Wave 4 re-reviews

The orchestrator hit the model's session-rate limit twice during
Wave 4c's re-review (after the consolidated fix-up was pushed).
Neither re-reviewer published a clear verdict; the orchestrator
merged based on direct diff verification against the prior review
findings.

**Fix forward:** Smaller fix-up commits. The 4c fix-up was 9 files /
229 insertions across 5 categories — three review passes' worth of
surface in one commit. Atomic commits would fit the re-review budget.

### `revokeInvite` was a silent no-op for the entire milestone

The `invites` table shipped in M1 with SELECT / INSERT / DELETE RLS
policies but no UPDATE policy. The accept flow uses a SECURITY DEFINER
RPC and never hit the gap. M2 didn't ship a revoke surface. M3 Wave 4c
added the revoke UI assuming the existing `revokeInvite` worked — and
it didn't.

Security-reviewer caught it. The fix-up adds a `.select` after the
UPDATE so zero affected rows throws. The proper fix (UPDATE RLS
policy or `revoke_invite` SECURITY DEFINER RPC) is an M4 follow-up.

### vCard CRLF injection (HIGH, both reviewers)

The original `escapeVCardText` handled `,` / `;` / `\` per RFC 2426 §4
but missed the newline escape. A user-controlled `display_name` with
CRLF would have let an insider inject forged vCards into every other
member's `.vcf`.

**Lesson:** When a pure function handles user-controllable data
crossing a serialization boundary (vCard, ICS, CSV, JSON-LD), the
default test set must include injection vectors. That's a `tdd-guide`
prompt update for M4.

### Cross-feature copy-key reuse caught at code review

Wave 4a referenced `itineraryForm_cancel` cross-feature because
arrivals didn't have that key. Code-reviewer flagged it MEDIUM. The
fix-up added `arrivals_cancel_cta` + `arrivals_edit_cta` + `_add_cta`.
Override F is supposed to prevent this; the fix-up exception pattern
is a clean precedent.

---

## Section 4 — Process learnings

1. **Parallel `tdd-guide` agents on independent worktrees is the right
   default for waves with 2–3 parallel PRs.** No file-collision issues
   across Wave 3 (2 PRs) or Wave 4 (3 PRs).

2. **Open the PR before dispatching reviewers.** Reviewer prompts
   reference the PR number for `gh pr review --comment`.

3. **One consolidated fix-up round per PR per round.** Iterating with
   the reviewer twice on the same surface burns budget.

4. **Worktree cleanup follows merge.** `git worktree remove --force` +
   `git branch -D <branch>` after each merge. Keeps the main tree
   clean through the whole milestone.

5. **`gh pr update-branch <num>` is required when a parallel-wave PR
   becomes BEHIND.** Auto-merge handles the CI gate; update-branch
   handles staleness. Both required.

6. **CI restarts on `update-branch`.** Every update-branch triggers
   ~3-4 min of CI. For three sequential merges that's ~10 minutes.

---

## Section 5 — Recommendation for next session (M4)

M4 — **Trip is shippable** — is the ship moment. Per
`notes/roadmap.md`, stop at M4 and use the app for one real bachelor
party before opening M5.

**Carry-forward from M3:** All seven Overrides (A–G); parallel
reviewer dispatch as default; smaller fix-up commits (under 100 LOC);
`tdd-guide` prompt updated to require injection vectors in test sets
for pure functions crossing serialization boundaries.

**Carry-back follow-ups from M3 (tracked for M4):**

1. **`invites` UPDATE RLS policy or `revoke_invite` SECURITY DEFINER
   RPC** — replaces the action-layer no-op detector.
2. **`invites.token` SELECT RLS tightened to `is_trip_organizer`.**
3. **`item-card.tsx` emoji icons → lucide SVG** (matches Wave 4a).
4. **`getNextUpcomingItem` may be removable.** Wave 3b replaced its
   only caller with `getItineraryByTrip`.
5. **Trip-local timezone (#108)** for `whatsHappeningNow` + itinerary.
6. **Rate-limit budget ratchet review (#141).** All M3 scopes use the
   default 30 req / 60 s; some likely too loose.
7. **`createInviteAction` idempotency-key.** Drunk-organizer-with-bad-
   signal not covered.
8. **`setTripNotes` could call `revalidatePath`.** Multi-tab sessions
   would otherwise see stale notes.

**The bright line still applies:** M5 is gated on a real-trip
retrospective. Don't open M5 until you've used M3+M4 on an actual
bachelor party.
