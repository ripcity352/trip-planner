# CLAUDE.md

This file is read by Claude Code at the start of every session. It defines
project conventions. Follow these unless explicitly told otherwise.

## What this project is

A web app for planning group trips — starting with a single bachelor party as
the MVP, designed to generalize to any "friends planning a trip together" use
case. Members of a trip can RSVP, mark availability, see the itinerary, post
announcements, split expenses, and share photos.

The app is **mobile-first**. Most users will access it from a phone link sent
in a group chat. Desktop should work but is not the priority.

## Stack

- **Framework:** Next.js 16 (App Router) + TypeScript (strict mode). The
  `middleware.ts` file convention is deprecated in v16 in favor of
  `proxy.ts`; we keep the old name for now since the Supabase SSR docs
  still target it. See `notes/decisions.md` if/when we migrate.
- **Styling:** Tailwind CSS + shadcn/ui (components live in `/components/ui`)
- **Database + Auth + Realtime + Storage:** Supabase
- **Hosting:** Vercel
- **Package manager:** pnpm (always — never npm or yarn in commands)
- **Forms:** react-hook-form + zod
- **Dates:** date-fns (not moment, not dayjs)

## Architecture rules (important)

1. **Server Components by default.** Only add `"use client"` when you need
   state, effects, browser APIs, or event handlers. If you find yourself
   adding `"use client"` to a large component, see if you can extract just
   the interactive part into a smaller client component instead.

2. **All DB access goes through `/lib/db/`.** Never call `supabase.from(...)`
   directly inside a route or component. Define typed query functions in
   `/lib/db/<table>.ts` and import those. This makes the data layer
   replaceable and gives us one place to add caching/logging later.

3. **Mutations use Server Actions**, not API routes, unless there's a reason
   to expose an HTTP endpoint (e.g. webhooks).

4. **Auth via Supabase magic links.** No passwords. The login flow is:
   user enters email → receives link → clicks link → lands on
   `/auth/callback` → redirected into the app. There is no "sign up" — first
   login creates the account.

5. **Row-Level Security is the source of truth for access control.** Do not
   gate access in application code as the only check. Every table with
   user-scoped data must have RLS policies. If you add a new table, you must
   add policies in the same migration.

6. **Multi-tenant from day one.** Even though the MVP is a single trip, every
   query must scope by `trip_id`. There is no "global" data. The data model
   is: a `Trip` has many `trip_members`, and you can only see data for trips
   where you are a member.

7. **Visibility-first feature design.** Every user-content table
   (`itinerary_items`, `announcements`, `polls`, `expenses`, `pins`,
   `photos`, etc.) ships with a `visibility trip_visibility not null
   default 'everyone'` column. Enum: `everyone | organizers_only |
   hide_from_celebrant | custom`. When adding a new content type, decide
   its default visibility *before* coding. The celebrant-vs-organizer
   asymmetry is the differentiator (see
   `notes/research/persona-groom.md`). Custom audiences via the
   `content_visibility_grants` join.

8. **Don't encode a default.** When designing a primitive — RSVP, splits,
   dietary, dress code, visibility — default to **per-item granular**, not
   "uniform attendee assumed, exceptions opt out." Non-default attendees
   (broke / sober / dietary-restricted / late-arrival / +1 / younger
   relative) opt **into** participation, not out of assumptions. See
   `notes/research/persona-edge-attendees.md`.

9. **Idempotency on mutations.** Every mutation server action accepts a
   client-generated `idempotency_key`. Mutation-heavy tables
   (`money_pool_entries`, `expenses`, `announcements`, future `pins`,
   `polls`) ship with `idempotency_key uuid` + partial unique index. The
   actual use case is drunk user on bad cell signal double-tapping.

10. **Currency on money fields.** Every money column ships with a
    `currency char(3) not null default 'USD'` sibling. Cheap now, no
    migration pain at the first international trip.

11. **Roles add micro-affordances, not gates.** Role differences
    (celebrant, organizer, co-organizer, member, +1) surface as UI
    affordances (a private drawer, a badge graphic, one bespoke string
    per phase) not as access-denied messages. The celebrant doesn't see
    "you can't edit the itinerary"; the celebrant sees *"Dave's got
    this."*

## UI voice and microcopy

Every UI string ships under a one-question test:

> *Would you say this out loud at a pre-trip dinner?*

If yes, ship. If it sounds like a SaaS onboarding email, rewrite.

- **Right tones:** warm, irreverent, self-aware, occasion-specific —
  Partiful invite copy, Cash App confirmations, the best-man speech
  that lands without cringe
- **Wrong tones:** corporate enthusiasm (*"Let's make memories!"*),
  hollow hype (*"Get PUMPED"*), frat-coded (*"Beers on deck"*),
  passive-aggressive nudge (*"Carl still hasn't responded..."*),
  gender-assuming, penis-coded

Microcopy review is a checklist item in `.github/pull_request_template.md`
for any UI-touching PR. See `notes/research/ux-design-principles.md` for
the full voice guide + sample strings.

## File and folder conventions

```
/app
  /(marketing)         public pages (landing, about)
  /(auth)              login, magic-link callback
  /trips
    /new               create a trip
    /[tripId]          authed trip dashboard (the main app)
      /availability
      /itinerary
      /announcements
      /expenses
      /photos
  /api                 only for webhooks / external integrations
/components
  /ui                  shadcn primitives — generally don't edit, just add
  /trip                trip-specific composed components
/lib
  /supabase            server.ts, browser.ts, middleware.ts clients
  /db                  typed query functions, one file per table
  /utils               small pure helpers
/supabase
  /migrations          SQL migrations, timestamped
/notes                 design decisions, "things I tried", scratch docs
```

- Component files: `PascalCase.tsx`
- Everything else: `kebab-case.ts`
- Co-locate component-specific types in the same file; shared types go in
  `/lib/types.ts`

## Styling rules

- Tailwind utility classes only. No CSS modules, no styled-components.
- Use shadcn components. To add one: `pnpm dlx shadcn@latest add <name>`.
  Do not install other UI libraries (MUI, Chakra, Mantine, etc.) without
  asking.
- Mobile-first: design for ~375px width first, then layer breakpoints.
- Use the `cn()` helper from `/lib/utils.ts` to merge classes.

## When working on a task

1. **Read this file and any relevant `/notes/*.md` first.**
2. **All work goes through a PR.** Never push directly to `main`. Create a
   feature branch (`feat/<short-name>`, `fix/<short-name>`,
   `chore/<short-name>`) → push → open PR → CI must pass → merge.
   See [`notes/collaboration.md`](./notes/collaboration.md) for the full
   workflow.
3. If the task involves the database, look at existing migrations in
   `/supabase/migrations` to understand current schema before changing it.
   See [`notes/database-workflow.md`](./notes/database-workflow.md) for
   migration discipline and the local/staging/prod environment split.
4. If the task involves UI, check if a shadcn component already exists for
   what you need before building from scratch.
5. After making changes, run:
   - `pnpm typecheck`
   - `pnpm lint`
   - `pnpm test`
   - `pnpm build` (for non-trivial changes)
6. For schema changes:
   - Create a new timestamped migration file — never edit an existing one
     that's been applied
   - RLS policies for new tables go in the **same** migration
   - Test the migration locally against `pnpm dlx supabase db reset`
     before opening the PR
7. Conflicts in `/lib/db/`, `/supabase/migrations/`, or
   `/notes/decisions.md` get **resolved by conversation in the PR**, not
   by silent merging. Tag the other dev for review.

## What NOT to do

- Don't push directly to `main`. Open a PR. (Branch protection enforces
  this, but the rule predates the protection.)
- Don't merge your own PR without the other dev's review unless it's a
  trivial fix you've explicitly flagged as "self-merge OK" in the PR
  body.
- Don't add new dependencies without flagging it in the response.
- Don't bypass RLS by using the service role key in app code (service role
  is only for migrations and admin scripts).
- Don't write inline SQL in components.
- Don't build any of the **hard-banned UI patterns** below — these are
  load-bearing for the "helpful, not burdensome" promise:
  - No leaderboards (RSVP speed, payment, photo count, votes — any kind)
  - No streaks (no Duolingo owl)
  - No achievement unlocks / badges for routine actions
  - No notification-preferences settings screen — one smart default +
    OS-level mute (push only for cliff dates / day-of / payment due,
    never for "Pete added a photo")
  - No tooltips, onboarding banners, "complete your profile" prompts,
    or progress bars / completion scores — the trip is not a project
    with a done state
  - No required fields with asterisks anywhere
  - No anthropomorphized mascot ("Hi, I'm Sparky!")
  - No reaction inflation (cap at ~6 fixed emoji)
  - No penis-anything in UI / assets / copy
- Don't use `any` in TypeScript without a `// eslint-disable` comment
  explaining why.
- Don't add tests for trivial things; do add them for data-layer functions
  in `/lib/db` and for any non-obvious business logic.
- Don't commit `.env.local` or anything in `.env*` except `.env.example`.
- Don't share secrets in chat/email/iMessage — see "Sharing secrets"
  below for the role-based path.

## Environment variables

See `.env.example` for the full list. The three that matter most:

- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — anon key, safe for browser
- `SUPABASE_SERVICE_ROLE_KEY` — server-only, never expose to client

**Sharing secrets between devs:** path depends on role (Vercel Hobby
caps teams at 1 member, so the collaborator isn't on the Vercel team).

- **Owner (`ripcity352`)**: `pnpm dlx vercel link` once, then
  `pnpm dlx vercel env pull .env.local` to sync.
- **Collaborator**: copy Supabase URL + anon key + service-role key
  from the Supabase dashboard → Settings → API into their own
  `.env.local`. One-time setup; refresh manually when keys rotate.

When you rotate a key, open an Issue with the `security` label so the
other dev sees it and re-pulls / re-copies. Full details in
`notes/collaboration.md`. Decision context: `notes/decisions.md` →
"Secrets sharing: owner uses Vercel env pull, collaborator reads
Supabase dashboard."

**Local Supabase:** when running `pnpm dlx supabase start` locally, the
local URL + anon key go in a separate `.env.local` block — the Supabase
CLI prints them at startup. See `notes/database-workflow.md`.

## Current phase

See `/notes/roadmap.md` for the milestone plan (M1–M5). We are currently
on **M1 — Foundation + Schema**. Roadmap was restructured 2026-05-19
after a multi-perspective review; see `notes/decisions.md` (top entry)
and `notes/killed-and-deferred.md` for what was cut and why.

**MVP target:** ship M1 → M4 for one real bachelor party. Stop at M4.
M5 is gated on a real-trip retrospective.

When you complete a milestone, update `/notes/roadmap.md` to mark it done
and add any deviations or follow-ups to `/notes/decisions.md`.

## Research and tooling pointers

Before starting a milestone:

1. Read `notes/killed-and-deferred.md` — don't re-propose what was already cut
2. Read `notes/research/INDEX.md` (1-line summary of every research artifact)
3. Read the relevant persona for whose UX you're building
   (`persona-groom.md`, `persona-best-man.md`,
   `persona-edge-attendees.md`)
4. Skim `notes/research/audit-round-2.md` for cross-cutting gaps
4. Use the per-goal skill / agent recommendations in
   `notes/research/tooling-and-skills.md` §2
5. For every Supabase task, invoke the `supabase:supabase` skill first
6. For every server action, pair `security-reviewer` + `code-reviewer`
   agents before commit
7. The Supabase MCP + Vercel MCP servers should be authenticated (one-
   time OAuth per session) — they're the highest-ROI tooling for this
   stack
