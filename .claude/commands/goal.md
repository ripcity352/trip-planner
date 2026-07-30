---
description: Drive a Party Trip milestone end-to-end with subagent-driven planning, audited gates, and the M3 override discipline. Usage:/goal m4
argument-hint: <milestone-slug, e.g. m4>
---

# /goal — Party Trip milestone driver

You are driving the milestone passed as `$ARGUMENTS` (e.g. `m4`, `m5`). This
command is a six-phase, subagent-driven orchestrator. Each phase has audit
gates designed to prevent the failure modes the M1/M2/M3 retros surfaced.

**You are not implementing this milestone in one turn.** You are running a
disciplined plan-audit-execute-close loop. Spread the work across turns;
don't fake completeness.

---

## North star — the "fun app" rubric (load-bearing)

Party Trip is built for ONE bachelor party (per `notes/roadmap.md` §M4
bright line). The threat model is **insider mischief** at a 12-person
trip, NOT internet-scale adversaries. This shapes every audit decision.

| ALLOWED engineering | HARD NO |
|---|---|
| Insider-injection guards on serialization boundaries (vCard / ICS / CSV / JSON-LD) | MFA, CAPTCHAs, password rules |
| RLS leak prevention; SECURITY DEFINER scoping | Session-binding fingerprinting |
| Idempotency keys on mutations | Per-request audit-log infra (deferred to M5) |
| Rate-limit on auth + invite mint | Notification preferences settings screen |
| Real-browser 375px smoke before merge | Multi-region CDN tuning |
| TZ-aware date rendering | Defensive try/catch around "can't happen" paths |
| Voice-tested microcopy from `lib/copy/*` | "Helpful" onboarding tooltips / banners |

When in doubt: **lower-friction-for-user > higher-defense-for-engineer.**
The user explicitly does not want top-tier security that makes login
annoying. Magic-link with one-time email is the bar.

---

## Invariants (the M3 Overrides A–G + retro-derived J–L — carry forward unless explicitly changed in Phase 3; H/I — single-file serialization and wave-worktree timing — are defined in the DS/CARRY execution plans and carry too)

- **[A]** Real-browser 375×812 smoke on the Vercel preview URL before
  any wave PR merges. Screenshots under `## Preview smoke (375px)` in PR body.
  **Local-dev fallback:** a route gated on `NODE_ENV === "production"`
  (e.g. `/dev/smoke`) **404s on the Vercel preview** — Vercel sets
  `NODE_ENV=production` on preview deploys too. For such surfaces, smoke
  against a local `pnpm dev` server (grant Playwright clipboard perms to
  exercise copy paths) and say so in the PR body. The intent (real-browser
  375px exercise) is met; the preview URL just can't host that route.
- **[B]** Cross-wave infra (auth fixtures, schema, copy keys, env-var
  contracts) is **Wave 0**. No `test.fixme()` markers as a substitute.
- **[C]** Tests live in `lib/`, `components/`, `tests/unit/` only.
  `vitest.config.ts` excludes `app/`; a
  `grep -rEn "\b(describe|test|it)\(" app/` returning non-empty fails the
  wave gate. (Use the `\b` word-boundary form — the older
  `describe\(|test\(|it\(` pattern false-matches `onSubmit(` /
  `handleSubmit(` via the `it(` inside `Submit(`.)
- **[D]** `security-reviewer` + `code-reviewer` dispatched in **parallel**
  (single message, two `Agent` calls) from PR open. One consolidated
  fix-up round per re-review; fix-ups stay under 100 LOC (M3 budget lesson).
- **[E]** DoD has two axes per line: `[d]` *declared* (CI green + reviewer
  approved) and `[v]` *verified* (exercised on travelston.com at 375px).
  `[v]` is closure-only.
- **[F]** No inline JSX leaf string literals. Every UI string sourced from
  `lib/copy/empty-states.ts`, `lib/copy/errors.ts`, or the milestone's
  copy palette appended in Wave 0a.
- **[G]** `app/page.tsx` ownership at closure — update for new reality OR
  write an explicit `kept as-is, decision: …` ADR entry.
- **[J]** *(CARRY retro, 2026-06-10)* **Flake fixes require a
  deterministic RED + independent replication.** Any "fix the flaky
  test" PR must first show the failure firing *deterministically* (e.g.
  injected mock delay widening the race window) — stress loops are
  detection, not proof (40 greens leave ~7% false-pass at a 1/8 rate).
  The orchestrator then re-runs the stress proof itself in a fresh
  process before the PR opens; the agent's own green loop does not
  count. Sweep the whole pattern class including *setup helpers*, not
  just assertion-site instances (the CARRY round-1 miss lived in
  `advanceToCodeVerifyMode`).
- **[K]** *(CARRY retro)* **Plan self-consistency is a Phase-4 audit
  item.** The re-audit briefs must include: do the plan's constraints
  contradict its own approach (CARRY shipped "migrate to `userEvent`"
  and "zero new dependencies" in the same document — grep
  `package.json` for every import the approach mandates), and does
  every "Closes #X, #Y" use the keyword per issue (`Closes #X,
  closes #Y` — the comma form silently leaves #Y open).
- **[L]** *(CARRY retro)* **Declare review-reality in the plan's
  Constraints, then keep it.** Either a named human's GitHub review
  blocks specific PRs (and the wave *waits* for it), or
  agent-review-plus-orchestrator-merge is the declared norm for the
  wave. Writing "NOT self-merge" and merging anyway is the one
  indefensible middle state (CARRY #310). Whatever is declared, PR
  bodies must match it.

---

## Phase 0 — PRE-FLIGHT (no writes; verify the runway is clear)

Read in parallel (multiple `Read` calls in one message):
- `notes/retros/m2-retro.md` (full)
- `notes/retros/m3-retro.md` (full)
- `notes/roadmap.md` (full) — extract `§$ARGUMENTS` DoD
- `notes/decisions.md` (last ~500 lines for recent ADRs)
- `notes/killed-and-deferred.md`
- `notes/deployment-readiness.md`
- `CLAUDE.md`
- `ROADMAP.md`

Then run these `Bash` checks in parallel:
- `gh issue list --milestone "M$N — <title>" --json number,title,labels,state,url --limit 100` (resolve title from roadmap)
- `gh pr list --state open --json number,title,headRefName`
- `pnpm typecheck && pnpm lint && pnpm test --silent 2>&1 | tail -20`
- `git status --porcelain && git worktree list`
- `ls notes/m*-execution-plan.md notes/m*-finish.md 2>/dev/null`

**Pre-flight gate — STOP and ask the user if ANY of:**
1. Prior milestone retro doesn't exist or is incomplete.
2. Prior milestone's carry-back follow-ups are not filed with this milestone's label.
3. `main` is not green (typecheck / lint / test failing).
4. Open PRs target this milestone or prior milestone — drain them first.
5. Stray worktrees exist under `.claude/worktrees/` from prior runs — clean them.
6. `notes/<milestone>-execution-plan.md` already exists (mid-flight resume? confirm before overwriting).

If pre-flight clears, summarize state in ≤8 lines and proceed to Phase 1.

---

## Phase 1 — SCOPE DISCOVERY

Dispatch ONE `planner` agent with this brief:

> Read `notes/roadmap.md` §$ARGUMENTS, the prior retro's "Recommendation
> for next session" section, and the currently-milestoned GH issues. Produce
> a scope memo containing:
> 1. Roadmap-declared DoD (verbatim bullets).
> 2. Carry-forwards from prior retro (load-bearing follow-ups).
> 3. Currently-open issues with this milestone's label (numbers + titles).
> 4. Cross-cutting infra candidates for **Wave 0** — any work that, if
>    deferred past Wave 0, becomes downstream debt (the M2 auth-fixture
>    lesson: cross-wave infra retrofitted mid-milestone produces
>    `test.fixme` clusters and partial-DoD ticks).
> 5. Items that look orphaned (in roadmap but no GH issue, or in GH
>    issues but not in roadmap §$ARGUMENTS).
> 6. Estimated wave count (target ≤5 waves; >6 is a "split the
>    milestone" signal).
>
> Report in ≤300 words. Do not write the execution plan yet.

Hold this scope memo in your context for Phase 2 + Phase 3.

---

## Phase 2 — CRITICAL AUDIT (4 parallel sub-agents)

In a **single message**, dispatch FOUR `Agent` calls. Each gets the scope
memo from Phase 1 + a distinct lens. The point is independent attention
from the same model (M3 retro §2.D — parallel review catches different
things than sequential).

### Audit 1 — Lazy-Path Detector (`subagent_type: code-reviewer`)
Brief:
> Review the scope memo for shortcuts that match patterns the M2 retro
> §2 named as failure modes:
> - Cross-wave infra deferred past Wave 0 → downstream `test.fixme()`
>   cluster (auth fixture in M2).
> - Inline JSX literals planned instead of copy-palette keys.
> - Sequential reviewer calls instead of parallel.
> - Local-only verification (CI green) substituted for production smoke.
> - DoD ticks without `[v]` walk plan.
> - Adding code without writing tests first.
> - Carry-back follow-ups silently dropped instead of milestoned.
> - Self-merge or COMMENTED-as-approval seams (M3 §2.D footnote).
> Report findings with severity CRITICAL / HIGH / MEDIUM / LOW.

### Audit 2 — Over-Engineering Detector (`subagent_type: architect`)
Brief:
> Review the scope memo against Party Trip's "fun app, one bachelor
> party" north star (see this command file's North-Star table). Flag any
> work that:
> - Adds defense-in-depth for adversaries outside the insider threat
>   model (MFA, CAPTCHAs, fingerprinting, audit-log infra, etc.).
> - Builds abstractions for "future tenants" / "future use cases" beyond
>   M4 (multi-tenant pivot is M5).
> - Introduces settings screens / notification-preferences UI.
> - Re-introduces hard-banned patterns from `notes/killed-and-deferred.md`
>   or `CLAUDE.md` "hard-banned UI patterns."
> - Designs for hypothetical scale (>50 trip members, >1 trip per user).
> Report with severity. Recommend trimming each flagged item to its
> simplest form that meets the actual MVP need.

### Audit 3 — Coverage Maximizer (`subagent_type: general-purpose`)
Brief:
> Read `notes/retros/m2-retro.md` §5 and `notes/retros/m3-retro.md` §4
> (process learnings). For each documented learning, verify the scope
> memo accounts for it. Examples to check:
> - L1: CI green ≠ feature works → does every wave have a 375px prod smoke?
> - L2: env-var ownership → does `notes/deployment-readiness.md` need
>   appends for new deps in this milestone?
> - L6: cross-wave infra as Wave 0 → are all such items in Wave 0?
> - M3 §4.1: parallel `tdd-guide` agents → does the wave plan use them?
> - M3 §3 "vCard CRLF injection" → are serialization-boundary tests on
>   the test list for any new boundary code?
> Report gaps with severity. The bar: a coverage finding is CRITICAL if
> ignoring it would replay a documented past failure.

### Audit 4 — Voice / Persona Critic (`subagent_type: general-purpose`)
Brief:
> Read `notes/research/persona-groom.md`,
> `notes/research/persona-best-man.md`,
> `notes/research/persona-edge-attendees.md`, and
> `notes/research/ux-design-principles.md`. For every UI-touching item
> in the scope memo, ask:
> - Would the planned surface pass the "would you say this at a pre-trip
>   dinner?" test?
> - Does any planned default encode an assumption that an edge-case
>   attendee (broke / sober / dietary-restricted / late-arrival) would
>   need to opt out of, violating CLAUDE.md rule #8 ("don't encode a
>   default")?
> - Does any new "feature" risk sliding into a leaderboard / streak /
>   badge / progress-bar pattern banned in `notes/killed-and-deferred.md`?
> Report with severity. The bar: a voice/persona finding is HIGH if a
> persona test would feel patronizing or excluded.

**Reconciliation:** Collect all four audit outputs. Produce a single
delta list grouped by severity. CRITICAL/HIGH must be addressed in the
Phase 3 plan draft. MEDIUM/LOW noted but may stay open.

---

## Phase 3 — PLAN DRAFT (sequential: architect → planner)

### 3a — Architect sign-off (`subagent_type: architect`)
Brief:
> Given the scope memo + Phase 2 audit delta list, produce:
> 1. A **per-server-action contract table** for every mutation introduced
>    in this milestone. Columns: action name | idempotency scope |
>    rate-limit scope | RLS gate | error map. (M2 retro §5.L5 lesson —
>    drift on un-enumerated contracts is unforgivable; drift on
>    enumerated ones is a load-bearing decision.)
> 2. Schema sign-off if migrations are needed: table shapes, FK
>    targets, RLS policies, idempotency-key partial-unique indexes.
> 3. Explicit Wave 0 deliverables list addressing every CRITICAL/HIGH
>    audit finding that maps to cross-wave infra.

### 3b — Planner draft (`subagent_type: planner`)
Brief:
> Using the architect sign-off + scope memo + audit delta, draft
> `notes/<milestone>-execution-plan.md` mirroring the shape of
> `notes/m3-execution-plan.md`. Required structure:
> - "Constraints" section re-stating Overrides A–G (carry from M3) plus
>   any new milestone-specific override the audit deltas justify.
> - Wave 0 with explicit Wave 0a / 0b / 0c PRs as needed.
> - Per-wave **file-ownership matrix** with the columns: ID | Branch |
>   Closes | Owns (files) | Tests claimed | Risk.
> - **Zero file overlap across parallel-wave PRs.** Flag any potential
>   conflict explicitly with a sequential-merge note.
> - DoD section with `[d]` / `[v]` checkboxes per item.
> - Closure-wave checklist including the production browser walk script.
> - Reading list for each wave's agent (3–5 files max).

Save to `notes/<milestone>-execution-plan.md`. Do not edit anything else.

---

## Phase 4 — HARD GATE (re-audit + stop)

Re-dispatch the **same four audit agents** from Phase 2 on the draft
execution plan. Use the file path as input. Same severity bar.

Then **STOP** and post to the user:
1. Path to the draft plan.
2. Wave count + PR count estimate + file count estimate.
3. Phase 2 + Phase 4 audit findings by severity (CRITICAL/HIGH first).
4. The Wave 0 deliverables list.
5. One-line "north star check" — does the plan over-engineer or
   under-engineer for the fun-app rubric?
6. Explicit ask: "Proceed to Phase 5 execution? Reply CONFIRM to start
   Wave 0; reply with edits to revise the plan."

**Do not enter Phase 5 without explicit user confirmation.**

---

## Phase 5 — EXECUTION (wave-by-wave loop)

For each wave in `notes/<milestone>-execution-plan.md`:

**Per-PR workflow (M3 proven dispatch):**
1. `git worktree add` under `.claude/worktrees/agent-<wave-id>` for the
   feature branch. One worktree per PR avoids the parallel-agent
   `git checkout` collision.
2. Dispatch `tdd-guide` agent into that worktree. Brief: RED tests
   first against the wave's file ownership; GREEN minimal impl;
   REFACTOR; verify 80%+ coverage on new code.
3. Open the PR (`gh pr create`) with the M3-style body: scope,
   files touched, screenshots-placeholder for the smoke.
4. **In a single message, dispatch BOTH `security-reviewer` and
   `code-reviewer` in parallel** referencing the PR number. Always
   parallel; never sequential.
5. If both pass → smoke step (6). If either finds issues → ONE
   consolidated fix-up commit (target <100 LOC); re-dispatch both
   reviewers in parallel.
6. **375px production smoke** on Vercel preview URL via MCP-driven
   Playwright. Screenshot the changed surface. Paste into PR body
   under `## Preview smoke (375px)`.
7. `gh pr update-branch <num>` if BEHIND base. Then
   `gh pr merge --squash --delete-branch`.
8. `git worktree remove --force <path>` + `git branch -D <branch>` after
   merge. Tick `[d]` in the execution plan.

**Per-wave gate (before declaring wave complete):**
- `grep -rEn "\b(describe|test|it)\(" app/` returns zero (Override C —
  word-boundary form; the bare `it\(` matches `Submit(` and false-fails).
- All wave PRs merged + smoke screenshots present.
- Execution plan `[d]` ticks updated for this wave's DoD items.

**Pre-authorized actions (no need to re-ask):**
- Open PRs from `feat/*` | `fix/*` | `chore/*`.
- Squash-merge after CI + `code-reviewer` approval (plus
  `security-reviewer` approval on auth/data/money/serialization-boundary PRs).
- `gh pr update-branch <num>`; `git rebase origin/main` +
  `git push --force-with-lease` on `feat/*` only.
- `git worktree add/remove`; `git branch -D` on merged feature branches.

**NEVER without asking:**
- Force-push `main`.
- Skip hooks (`--no-verify`) or bypass signing.
- Merge without `code-reviewer` approval even if CI is green.
- Add a new npm dependency.
- Edit a previously-applied migration in place.
- Use the service-role key in app code.

**Hard stops (surface state and ask the user):**
- 150 turns elapsed since `/goal` started.
- 2 consecutive wave-gate failures.
- Migration ordering ambiguity surfaces.
- New dependency request.
- Plan-drift requires changing a previously-decided per-action contract.

---

## Phase 6 — CLOSURE

1. **Production browser walk** at https://travelston.com on 375×812 via
   MCP-driven Playwright. Walk every golden-path step listed in the
   execution plan's closure checklist. Capture one screenshot per step
   (minimum 8 for a full milestone). Verify no console errors on any
   route.
2. Tick `[v]` axes in `notes/<milestone>-execution-plan.md` ONLY for
   items the walk actually exercised. Declared-but-not-verified items
   carry forward to the next milestone's Phase 0 pre-flight.
3. Open the closure PR (`chore/<milestone>-done`) with:
   - Updated execution plan (`[v]` ticks).
   - Screenshots embedded in the PR body.
   - `app/page.tsx` updated for new reality OR an explicit
     "kept as-is, decision: …" entry (Override G).
   - Link cards on the trip dashboard for any new top-level routes.
4. **Author the retro** by dispatching TWO `general-purpose` agents in
   parallel:
   - Agent A persona: "code reviewer — was the execution rigorous?"
   - Agent B persona: "senior engineer — was the verification real?"
   Reconcile into `notes/retros/<milestone>-retro.md` mirroring the
   shape of `notes/retros/m3-retro.md`. Required sections: TL;DR,
   What shipped, What worked, What slipped/surprised, Process
   learnings, Recommendation for next session.
5. Update `notes/roadmap.md`: mark milestone done; set **Current phase
   → <next>**.
6. Append `notes/decisions.md` "<milestone> — <title> — milestone
   closed" entry with load-bearing in-execution decisions.
7. Update `CLAUDE.md` "Current phase" line.
8. Merge the closure PR. After merge, surface any retro-derived process
   changes that should propagate into this `/goal` command file itself
   (e.g. new override).

---

## Resume semantics

If `/goal $ARGUMENTS` is invoked and `notes/<milestone>-execution-plan.md`
already exists:
- Re-read the plan + current `[d]` / `[v]` state.
- Run Phase 0 pre-flight to verify `main` is still green.
- Skip Phase 1–4 and resume Phase 5 at the next unfinished wave OR
  Phase 6 if all waves are `[d]`-ticked.
- Surface the resume point to the user before continuing.

---

## Output style

- Concise turn-level updates. State results, not deliberation.
- When dispatching subagents, name each one and its lens in one line.
- After each phase, post a ≤6-line summary before moving on.
- Reference files as `path:line` where useful.
- Never claim a phase is complete without the artifact existing
  (execution plan file, PR URL, screenshot paths in PR body, retro file).
