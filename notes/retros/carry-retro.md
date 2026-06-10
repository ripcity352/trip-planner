# CARRY Retro — CI-trust & token-drift

> Dated 2026-06-10. Authored at closure. 10 issues + dependabot across
> 3 waves (0–2) + closure PR. Between-milestones, pre-gate carry-back
> wave: ZERO feature surface, ZERO server actions, ONE RLS-only
> migration. **The real-trip retro gate is untouched; M6 stays gated.**
>
> Parallel retro lenses: code-reviewer ("was execution rigorous?") +
> senior-engineer ("was verification real?"). Reconciled into this
> single file per the M3/M4/M5/DS pattern.

---

## TL;DR

CARRY shipped all 10 issues across 10 PRs (#300, #302–#303, #305–#310)
plus 8 dependabot merges, in one day. The headline work was real: the
async-submit flake class is fixed at the pattern level (not retried
away), the bachelor theme's token-cascade leaks are closed with
computed-style proof on production, and the invites RLS hole — any
member could read raw membership-granting tokens — is plugged and
**verified live on the database serving travelston.com**. Two follow-ups
were deliberately split out rather than half-shipped (#301 error-surface
restyle, #304 radius reconcile — the audit found 46 visually-changing
call sites, 7.7× the single-PR guideline). The two findings that matter:
the round-1 flake fix passed its own 40× stress loop and then failed an
independent re-run (independent replication, not the stress count, is
the load-bearing verification layer), and the wave's PRs merged without
the other dev's GitHub review despite the plan requiring it on #310 —
a process slip recorded honestly below.

---

## What shipped

| Wave | PRs | Issues |
|---|---|---|
| **0 — CI trust** | #300 (+ dependabot #270 first) | #230 + #207 — async-submit flake class: `fireEvent`→`userEvent`, `clickAndSettle` (`tests/fixtures/dom.ts`), per-test injected mock delays, deterministic RED proof, 60×4 stress twice independently, 5 CI rerun attempts green |
| **1 — token drift** (3 serialized) | #302, #303, #305 | #297 `--destructive: oklch(0.62 0.12 35)` bound in bachelor (45 call sites audited → #301 filed) · #188 `:root` scoped `:not([data-theme])` + 4 live leakers bound (`--secondary/-fg`, `--accent/-fg`) · #289 radius audit → re-scoped to #304 (46 visually-changing sites > N=6) |
| **2 — carry-backs** (5 parallel) | #306–#310 | #157 dead code · #250 enrichment settled (post-fetch map, no SQL view; `enrichAnnouncements` helper) · #245 default-pass docs · #156 emoji→lucide (strokeWidth 1.75) · #155 invites SELECT RLS → organizers-only (migration + 3-persona walk) |
| **dependabot** | #265–#268, #272, #299 merged; #298 deferred | vitest (Wave 0), actions bumps, react group, hookform, supabase group; eslint-10 major deferred with compat note |

One user-approved devDependency: `@testing-library/user-event ^14.6.1`
(hard-stopped pre-PR, approved, recorded in the plan).

---

## What worked

**The Wave-0 fix is determinism, not masking — and the RED proof is the
load-bearing artifact.** The injected `MOCK_DELAY_MS` makes the race
fail *deterministically* under the old pattern (pasted in #300's body).
That, not the stress count, is what proves the fix: stress loops only
bound flake probability (40 greens leave ~7% false-pass at the observed
rate); a deterministic reproduction proves the mechanism. Zero retry/
skip/fixme config anywhere — grep-verified.

**Independent replication caught what the agent's own proof missed.**
Round 1 passed the agent's 40× loop, then flaked at run 18 (and 45) of
the orchestrator's independent re-run. The residual race was in the
`advanceToCodeVerifyMode` *setup helper* — the fix had been applied at
assertion-site clicks but not swept through setup paths. Round 2 swept
all four suites for the query-after-transition shape and survived 60×4
twice (agent + orchestrator). The two-runner pattern is not ceremony.

**Computed-style equality is the strongest smoke evidence the project
has used.** #302's acceptance wasn't "looks orange" — it was
`getComputedStyle(revokeBtn).color === var(--destructive)` on the
deployed surface, re-verified at closure **on travelston.com** along
with body bg `rgb(16,12,15)`, `--card #1a1517`, and the four #303
bindings. It would have caught the original regression mechanically.

**#188's premise was falsified and the real bug found.** The 1b agent
proved the dual-defined-token cascade was never broken (source order
wins; no @import reorders) — the live leak class was tokens *absent*
from the theme block, exactly the #297 shape. Four genuinely-leaking
tokens (secondary/accent pairs rendering shadcn near-white on the dark
theme) were found and bound. Investigating before editing turned a
speculative fix into a real one.

**The #289 re-scope trigger did its job.** The mandated audit
(`notes/radius-audit.md`, 101 call sites with computed-px math) found 46
visually-changing sites — 7.7× the N=6 guideline. The wave landed the
audit + ADR + #304 instead of an unreviewable app-wide restyle, and the
audit surfaced the structural trap (token rebase and call-site rewrite
are inseparable: `rounded-lg` is a numeric no-op today at 8px but the
spec's named value is 16px, so rebasing tokens alone flips no-ops into
regressions).

**The RLS fix was verified at the right layer.** The #155 walk ran as
three real personas (organizer / co_organizer / attendee) with their own
JWTs against REST — *stronger* than a UI walk, because the UI 404s
non-organizers before fetching and would prove nothing about RLS. Result:
attendee 0 rows HTTP 200, both organizer classes 1 row. Post-merge, the
policy was confirmed live on the project serving travelston.com via
`pg_policy`.

**Sequencing discipline held.** Override H: zero parallel writers on
`globals.css`/`design-system.md` across 1a→1b→1c→2b. Override I: Wave-2
worktrees created only after Wave 1 fully merged. Override B: #270
merged before the stress proof; Wave 0 merged before any Wave-1/2 PR
opened.

---

## What slipped / surprised

**The other-dev review requirement was not honored (the wave's one real
process slip).** `gh pr view --json reviews` shows zero submitted GitHub
reviews on all ten PRs. #310 (RLS) was marked "NOT self-merge — needs
the other dev's review" in both the plan and its own body, and merged
anyway with wchang236 still only "requested"; #309's "self-merge after
ack" has no ack comment. The substance was mitigated (parallel agent
security+code review, the 3-persona walk, CI) but the process promise
was broken — silently, which is the part that can't recur. The honest
fix is to decide explicitly: either closure-blocking human review on
security-sensitive PRs (and the wave *waits*), or codify
orchestrator-merge-with-agent-reviews as the norm for agent-driven
waves. Don't write a rule the wave doesn't intend to keep.

**The plan contradicted itself on dependencies, and only execution
caught it.** "Migrate to `userEvent`" and "this wave introduces zero new
dependencies" shipped in the same document — `@testing-library/
user-event` wasn't in the tree. The hard-stop worked exactly as designed
(surfaced pre-PR, user approved, recorded), but the contradiction should
have died in the Phase-3/4 audits, which checked the stress bar's
statistics yet never grepped `package.json` for the mandated import.

**Stress-proof epistemics, stated honestly.** The "5 consecutive green
CI runs" were 5 rerun *attempts of one run-id* — same SHA, same workflow
snapshot, same restored pnpm cache; only runner timing varied. For a
race flake that's relevant variance, but it is weaker than 5 runs on 5
pushes. Recorded here so the next wave doesn't cite it as more than it
was. (The post-merge main runs — e.g. 27255439230 — all green, are the
fresh-environment signal.)

**Partial-mount residuals on two walks.** #303's dates-badge consumer
never mounted (no proposed windows on the walk trip) — the binding is
proven by computed style + the login secondary-button eyeball, but
badge-text-on-elevated-surface contrast was never visually confirmed.
#309's walk rendered meal/lodging/event icons; transport (`Plane`) and
activity (`Zap`) kinds never appeared on any real trip's itinerary
(typecheck guarantees the import; the 16px footprint for those two is
unverified visually). Both are noted, neither blocks.

**`Closes #230, #207` only closed #230.** GitHub needs the keyword per
issue; #207 sat open after merge and was caught by the retro lens, then
closed manually with a cite. Use `Closes #X, closes #Y`.

**The staging/prod split is aspirational, and that changed the #155
story — for the better.** `database-workflow.md` says prod "doesn't
exist yet" and staging gets CI pushes; in reality the lone Supabase
project (`bonvqazcqwkrowtkdmuq`) serves travelston.com, so main's
migration job put the RLS fix **live in production** the moment #310
merged (policy confirmed via `pg_policy`). Good for #155; bad for the
doc — the "manual push after 24h soak" prod step described there has no
real referent today. Docs follow-up noted below.

**Dependabot churned mid-wave.** It closed #269 and #271 itself,
superseding them with #299 (merged) and #298 (inherits the eslint-major
deferral). The "leave #271 open" instruction became moot within hours of
being written. Treat dependabot PR numbers as unstable references;
anchor deferrals to the *dependency*, not the PR.

---

## Process learnings

1. **Demand a deterministic RED per flake class; treat stress loops as
   detection, not proof.** The injected-delay reproduction is what made
   #300 trustworthy. Generalize: any "fix the flake" PR must show the
   failure firing deterministically before showing it fixed.
2. **Independent replication is a load-bearing layer.** The orchestrator
   re-running the agent's own stress proof (same commands, fresh
   process) caught a real residual race that the agent's identical loop
   had passed. Keep two-runner verification for anything probabilistic.
3. **Pattern fixes must sweep setup helpers, not just assertion sites.**
   The round-1 miss lived in a shared `advanceTo*` helper. When fixing a
   test-pattern class, grep for the shape everywhere — including the
   helpers tests call before their first assertion.
4. **Audit the plan's own consistency, not just its content.** Four
   audit agents checked statistics, walks, and scope — none cross-checked
   "zero new deps" against the approach that mandated a new import. Add
   a "plan self-consistency" item to the Phase-4 re-audit briefs.
5. **Investigate-before-edit pays.** #188 (premise falsified, real leak
   found) and #289 (re-scope trigger fired on real data) both turned
   "apply the prescribed fix" into better engineering because the agent
   was briefed to verify the diagnosis first.
6. **Make review-reality explicit per wave.** Either human review blocks
   (and the wave waits for the other dev), or agent-review-plus-
   orchestrator-merge is the declared norm. The middle state — writing
   "NOT self-merge" and merging anyway — is the only indefensible option,
   and it's what happened.

---

## Recommendation for next session

1. **#304 (radius reconcile) + #301 (error-surface restyle) are a
   natural paired DS slice** — both need §Radius / #209 spec
   ratifications first, both ripple through the same surfaces, and #217
   baseline regen guards both. Don't start either without the spec call.
2. **#298 (eslint 10 major)**: dedicated compat PR — run the #182
   rule-fires-on-fixture test under eslint 10 before merging anything.
3. **Update `notes/database-workflow.md`** to match deployment reality
   (the lone project serves travelston.com; CI pushes migrations to it
   on every main merge; there is no soak step today). The doc currently
   describes a safety process that doesn't exist — worse than no doc.
4. **#255 still needs Carl's OTP-only walk** (flagged at closure, out of
   CARRY scope).
5. **The M6 gate is unchanged**: the real-trip retrospective remains the
   only thing that opens M6. CARRY made the suite trustworthy and the
   theme drift-proof; it earns nothing toward the gate.
