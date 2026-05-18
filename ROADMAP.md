# Roadmap

> Public index. The source of truth is [`notes/roadmap.md`](./notes/roadmap.md);
> open issues against the goals below. Run `/roadmap` to regenerate.

## Milestones

### MVP — Goals 1–6 (real bachelor party)

| Goal | Status | Definition of done |
|---|---|---|
| Goal 1 — Foundation deployed | in progress | Next.js + Supabase scaffold, deployed to Vercel preview |
| Goal 1.5 — Repo hygiene | scaffold landed in initial commit | issue/PR templates, CI, Dependabot, Vitest + Playwright |
| Goal 2 — Auth + Trip creation | not started | magic links, /trips/new, RSVP UI, per-day attendance, co-organizer role |
| Goal 3 — Availability poll | not started | propose dates, yes/no/maybe per member |
| Goal 4 — Announcements + realtime | not started | organizer broadcasts; Supabase Realtime |
| Goal 5 — Itinerary builder | not started | day-by-day vertical timeline; ICS export |
| Goal 6 — MVP polish + ship | not started | custom domain, PWA manifest, Sentry, ToS stub, rate limiting |

### Post-MVP

| Goal | Status | Definition of done |
|---|---|---|
| Goal 6.5 — Money pool (manual) | not started | Venmo-deep-link "you owe Jake $400" coordination |
| Goal 7 — Expenses + photos | not started | settlement algorithm, photo wall with expiry |
| Goal 8 — Multi-tenant pivot | not started | landing, sign-up, trip templates, PostHog |

## Labels

| Category | Labels |
|---|---|
| Type | `type:feature`, `type:bug`, `type:refactor`, `type:research`, `type:chore`, `type:docs` |
| Priority | `priority:high` (medium/low are the default — no label) |
| Status | `status:needs-plan`, `status:needs-research`, `status:ready`, `status:in-progress`, `status:blocked` |
| Area | `area:auth`, `area:trips`, `area:rsvp`, `area:invites`, `area:availability`, `area:itinerary`, `area:announcements`, `area:expenses`, `area:photos`, `area:realtime`, `area:notifications`, `area:rls`, `area:ui`, `area:infra` |
| Cross-cutting | `mobile`, `accessibility`, `security`, `dx`, `legal`, `good-first-issue` |

## Foundation research

The roadmap above incorporates audit recommendations from foundation
research conducted on 2026-05-18:

- [`notes/research/audience-features.md`](./notes/research/audience-features.md) — target audience, competitor analysis, feature gaps
- [`notes/research/github-labels.md`](./notes/research/github-labels.md) — label taxonomy from exemplar repos
- [`notes/research/audit.md`](./notes/research/audit.md) — cross-reference of the two reports against the codebase, plus added recommendations
