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

See `/notes/roadmap.md` for the goal-by-goal plan. We are currently on:
**Goal 1 — Foundation deployed.**

When you complete a goal, update `/notes/roadmap.md` to mark it done and
add any deviations or follow-ups to `/notes/decisions.md`.
