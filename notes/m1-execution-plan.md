# M1 Execution Plan — Foundation + Schema

> Dated 2026-05-19. Structured for a `/goal`-driven, subagent-parallel
> push. Source for the wave structure is the multi-perspective review
> on the same day (see `notes/decisions.md` top entry +
> `notes/roadmap.md` M1 block).
>
> The goal loop reads this file on every turn — keep it terse and
> verifiable. Update the DoD checkboxes as work lands.

## Constraints (re-read every wave)

- **No push to `main`.** Every wave produces feature branches + PRs.
  Claude opens PRs; humans merge.
- **One migration file, not many.** All M1 schema issues collapse into
  one timestamped SQL file under `supabase/migrations/`.
- **RLS policies live in the same migration as the table.**
- **`/lib/db/types.ts` must update in the same PR as the migration**
  (hand-rolled types policy, `notes/database-workflow.md`).
- **New deps need a callout in the PR body** (project rule). The known
  new deps in M1: `@sentry/nextjs`, `@upstash/ratelimit`,
  `@upstash/redis`, `@vercel/analytics`. Flag any others discovered.
- **No direct DB access in components.** Everything routes through
  `/lib/db/`.

---

## Wave 0 — Pre-flight (sequential, single thread)

1. Disposition `#16` (CI applies migrations to staging on main merge)
   and `#17` (Vercel SSO gating for preview URLs). Either:
   - Convert the `status:needs-plan` / `status:needs-research` label
     into an actionable scope and ride them in Wave 3, **or**
   - Re-label to M5 and remove from M1 milestone.
2. Boot local Supabase: `pnpm dlx supabase start`.
3. Baseline green: `pnpm typecheck && pnpm lint && pnpm test &&
   pnpm dlx supabase db reset && pnpm build`.
4. Confirm branch protection on `main` is active. If missing, add it
   as a sub-task in Wave 1.
5. Confirm Supabase MCP + Vercel MCP authenticated for the session.

**Gate to Wave 1:** all checks above pass; #16/#17 dispositioned.

---

## Wave 1 — Independent infra + copy (parallel)

Dispatch via `superpowers:dispatching-parallel-agents`. Each row is a
separate subagent, opening its own feature branch and PR.

| Issue | Branch | Touches | Risk | Conflict notes |
|---|---|---|---|---|
| **#69** copy palettes | `chore/copy-palettes` | `lib/copy/empty-states.ts`, `lib/copy/errors.ts`, `lib/copy/__tests__/` | low | None |
| **#65** design-system PR checklist | `chore/ds-pr-checklist` | `.github/pull_request_template.md`, `notes/design-system.md` | low | None |
| **#68a** PWA manifest + apple-touch-icon | `feat/pwa-manifest` | `app/manifest.ts`, `public/apple-touch-icon.png`, `app/layout.tsx` head | low | Shares `app/layout.tsx` with #68b head links |
| **#68b** Sentry (server + browser + sourcemaps) | `feat/sentry` | `sentry.{server,client,edge}.config.ts`, `next.config.ts` (wrap), `.env.example` | medium | Wraps `next.config.ts` |
| **#68c** Upstash rate-limit seam | `feat/rate-limit` | `lib/rate-limit/index.ts`, `proxy.ts`/`middleware.ts`, `.env.example` | medium | Touches middleware — must compose with `lib/supabase/middleware.ts` |
| **#85** visual-regression Playwright pixel-diff | `feat/visual-regression-ci` | `e2e/visual/*`, `.github/workflows/ci.yml` | low | None |
| **Vercel Analytics** (DoD bullet) | folded into `feat/pwa-manifest` | `app/layout.tsx` Analytics import | low | Same file as #68a → same subagent |

**Coordination rule:** `#68a` + Vercel Analytics ship in one subagent
to avoid `app/layout.tsx` conflict. `#68b` owns `next.config.ts`;
`#68c` owns `proxy.ts`/`middleware.ts`. No other root-config overlap.

**`.env.example`** — three subagents touch this. Each subagent appends
its block to the bottom; merge order doesn't matter.

**Verification gate after Wave 1:**
```
pnpm typecheck && pnpm lint && pnpm test && pnpm build
# Each PR shows green CI via: gh pr checks <number>
# Manual: preview deploy boots, manifest serves, Sentry test event fires
```

---

## Wave 2 — Foundation migration (one PR, NOT parallel)

Single timestamped file: `supabase/migrations/<timestamp>_m1_foundation.sql`
Single branch: `feat/m1-foundation-migration`
Single PR.

Dispatch order: `architect` → `database-reviewer` draft → `security-reviewer` audit → `code-reviewer` final. Sequential, not parallel.

**Issues folded into the one migration:** #20, #21, #22, #23, #24, #25, #26, #66, #67, #70.

**Author order inside the SQL** (dependency-correct):

1. `trip_kind` enum + `is_template`, `deleted_at`, `archived_at` on `trips`
2. `is_celebrant` on `trip_members` + partial unique `(trip_id) where is_celebrant`
3. `citext` extension; `trip_members.id` synthetic uuid PK; drop composite PK; `user_id` nullable; add `display_name`, `phone_e164`, `email citext`
4. `trip_visibility` enum + `can_see_content(trip_id, visibility, content_id)` helper
5. `trip_members_visible_rsvp(viewer_id)` view (declining whispers)
6. `trip_member_days` table + auto-seed trigger on RSVP=going
7. `vibe_tags text[]` on `trips`
8. FK retargeting: every existing feature FK referencing `(trip_id, user_id)` → `trip_member_id`; include data backfill for any seeded rows
9. `currency char(3) not null default 'USD'` documented + applied where money columns already exist
10. Idempotency-key convention applied on existing mutation tables + documented inline
11. **RLS rewrite for every changed table** in the same migration. Add `is_trip_member_by_member_id(p_member_id)` sibling helper if needed.

**Companion edits in the same PR:**
- `lib/db/types.ts` — sync hand-rolled types with new schema
- `lib/db/trips.ts` — update queries broken by `user_id` becoming nullable
- `notes/database-workflow.md` — append idempotency-scope + FK convention notes if missing
- Vitest unit tests for any non-trivial `/lib/db/` function affected

**Verification gate after Wave 2:**
```
pnpm dlx supabase db reset           # clean apply, no errors
pnpm typecheck && pnpm lint && pnpm test && pnpm build
# Manual RLS smoke: non-member denied; organizer allowed; celebrant blocked from hide_from_celebrant rows
```

**Risk: HIGH.** FK retarget is the load-bearing operation. Single
reviewer, no concurrent PRs on `/lib/db/` or `supabase/migrations/`.

---

## Wave 3 — Verification + DoD wiring (parallel, low risk)

Dispatch parallel subagents after Wave 2 PR is merged.

| Task | Branch | Touches |
|---|---|---|
| Vitest + Playwright examples | `chore/test-examples` | `lib/db/__tests__/`, `e2e/smoke.spec.ts` |
| `notes/decisions.md` M1-complete entry + `notes/roadmap.md` mark M1 done | `docs/m1-done` | `notes/decisions.md`, `notes/roadmap.md` |
| Secret-scanning + push-protection verification on GitHub (settings + screenshot in PR body) | `chore/branch-protection-audit` | none in repo |
| `#16` / `#17` if upgraded in Wave 0 | per-issue branches | varies |

**Final M1 gate:**
```
pnpm typecheck && pnpm lint && pnpm test && pnpm dlx supabase db reset && pnpm build
pnpm exec playwright test
gh issue list --milestone "M1 — Foundation + Schema" --json state -q '. | length'   # → 0
```

---

## M1 DoD checklist (the source of truth — check as work lands)

- [x] Next.js 16 + strict TS on Vercel preview (already true; verify still true after waves)
- [x] Tailwind + shadcn/ui initialized (verify present)
- [x] `/lib/supabase/{server,browser,middleware}.ts` + session refresh in `proxy.ts`/`middleware.ts`
- [x] ESLint + Prettier configured
- [x] `.github/` hygiene: issue templates, PR template **with microcopy checklist (#65)**, Dependabot, CI workflow
- [ ] Branch protection on `main`; secret scanning + push protection on
- [ ] Vitest + Playwright with one example each (Wave 3)
- [x] PWA manifest + apple-touch-icon (#68a)
- [x] Sentry server + browser + sourcemaps (#68b)
- [x] Vercel Analytics enabled (Wave 1 — folded into #68a subagent)
- [x] Upstash rate-limit middleware seam (#68c) applied to `createTrip` + `acceptInvite` stubs
- [x] `lib/copy/empty-states.ts` + `lib/copy/errors.ts` written in app voice (#69)
- [x] **Foundation migration applied** (Wave 2) covering #20, #21, #22, #23, #24, #25, #26, #66, #67, #70
- [x] `lib/db/types.ts` matches migration
- [x] Visual regression CI live (#85)
- [x] `notes/decisions.md` M1-complete entry appended
- [ ] `notes/roadmap.md` marks M1 done
- [x] `#16` / `#17` dispositioned

---

## New dependencies this milestone introduces

Flag explicitly in PR bodies (project rule):

- `@sentry/nextjs` (#68b)
- `@upstash/ratelimit`, `@upstash/redis` (#68c)
- `@vercel/analytics` (Wave 1 folded)
- `@playwright/test` visual-snapshot plugin if not already (#85)
