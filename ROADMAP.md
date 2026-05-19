# Roadmap

> Public index. The source of truth is [`notes/roadmap.md`](./notes/roadmap.md);
> open issues against the milestones below. Run `/roadmap` to regenerate.
>
> Restructured 2026-05-19 after a multi-perspective review (architect,
> 3 personas, mobile-UX critic, product strategy). Cuts and deferrals are
> logged in [`notes/killed-and-deferred.md`](./notes/killed-and-deferred.md).
> Decisions from the review live in [`notes/decisions.md`](./notes/decisions.md).
> Earlier synthesis: [`notes/synthesis-2026-05-18.md`](./notes/synthesis-2026-05-18.md).

The MVP target is **one real bachelor party.** Ship M1 → M4. **Stop at M4.**
Come back to M5 only after a real-trip retro.

## Milestones

### MVP — M1 → M4 (real bachelor party)

| Milestone | Status | Definition of done |
|---|---|---|
| **M1 — Foundation + Schema** | in progress | Next.js + Supabase deployed to Vercel preview, CI green, foundation migration applied (trip_kind / is_celebrant / visibility enum / accountless attendees w/ synthetic PK + FK retarget / trip_member_days / vibe_tags / currency / soft-delete / idempotency convention), PWA + Sentry + rate-limit seam in place, copy palettes written upfront |
| **M2 — Trip is real** | not started | Magic-link auth, trip creation, logged-out invite preview, 3-state RSVP, co-organizer role (no spend cap), bachelor-specific celebrant-weighted date poll, Pulse Poll (aggregate-only default) |
| **M3 — Trip is useful** | not started | Itinerary (kind / activity_tag / dress_code, per-item RSVP + dietary flag, lodging, travel legs, vCard + Copy-all-numbers), "what's happening now" home card, FAQ field, announcements + realtime |
| **M4 — Trip is shippable** | not started | Custom domain, microcopy review enforced, axe + Lighthouse a11y pass, ToS/privacy stubs, send to attendees. **STOP HERE.** |

### Post-MVP

| Milestone | Status | Definition of done |
|---|---|---|
| **M5 — Earned post-trip** | gated on retro | Money pool, expenses + Settlement Closer, photos + Disposable Cam, Group Recap, multi-tenant pivot (bachelor + generic templates only), retention loops (Time Capsule, Recap Card, Live Now, Hype Memos), deferred infra (audit_log, dispatcher seam, OG cards), re-evaluated delight (Drumroll, Lock-In Day, Hot Seat — earn back via voice library + design rigor) |

## Labels

| Category | Labels |
|---|---|
| Type | `type:feature`, `type:bug`, `type:refactor`, `type:research`, `type:chore`, `type:docs` |
| Priority | `priority:high` (medium/low are the default — no label) |
| Status | `status:needs-plan`, `status:needs-research`, `status:ready`, `status:in-progress`, `status:blocked` |
| Area | `area:auth`, `area:trips`, `area:rsvp`, `area:invites`, `area:availability`, `area:itinerary`, `area:announcements`, `area:expenses`, `area:photos`, `area:realtime`, `area:notifications`, `area:rls`, `area:ui`, `area:infra` |
| Cross-cutting | `mobile`, `accessibility`, `security`, `dx`, `legal`, `good-first-issue` |

## Foundation research

The roadmap above incorporates findings from three research waves:

### Round 1 + 2 (2026-05-18)

- [`notes/research/audience-features.md`](./notes/research/audience-features.md), [`audit.md`](./notes/research/audit.md), [`github-labels.md`](./notes/research/github-labels.md) — round 1
- [`persona-groom.md`](./notes/research/persona-groom.md), [`persona-best-man.md`](./notes/research/persona-best-man.md), [`persona-edge-attendees.md`](./notes/research/persona-edge-attendees.md) — round 2 first-person personas
- [`ux-design-principles.md`](./notes/research/ux-design-principles.md), [`audit-round-2.md`](./notes/research/audit-round-2.md), [`integration-feasibility.md`](./notes/research/integration-feasibility.md), [`fun-and-delight.md`](./notes/research/fun-and-delight.md), [`tooling-and-skills.md`](./notes/research/tooling-and-skills.md) — round 2 supporting analyses

### Round 3 (2026-05-19) — multi-perspective prune

Six parallel agents reviewed the round-2 synthesis from distinct
perspectives (architect, groom persona, best-man persona, edge-attendees
personas, mobile-UX critic, product strategy). Output: 10 issues closed,
8 new issues created, 7 issue bodies amended, milestone restructure
from Goal-numbering to M1–M5. See:

- [`notes/killed-and-deferred.md`](./notes/killed-and-deferred.md) — what was cut and why
- [`notes/decisions.md`](./notes/decisions.md) — ADRs from this review at the top of the log
- [`notes/roadmap.md`](./notes/roadmap.md) — full milestone DoDs
