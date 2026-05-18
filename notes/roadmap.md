# Roadmap

Each goal is sized to be one focused Claude Code `/goals` session. Each goal
must end with something deployed to Vercel and viewable on a phone.

Goal 2/6 DoDs and the inserted Goal 1.5 / mini-goal between 6 and 7 reflect
audit recommendations from `/notes/research/audit.md` (2026-05-18).

---

## Goal 1 — Foundation deployed [ ]

**Definition of done:**
- Next.js 15 app with TypeScript strict mode created with pnpm
- Tailwind + shadcn/ui initialized
- Supabase project created (manually by user), env vars wired in
  `.env.local` and in Vercel
- Supabase server + browser clients in `/lib/supabase/`
- Middleware for session refresh in place
- Deployed to Vercel with a real preview URL
- A placeholder home page at `/` that shows "Bachelor Party Planner" and
  confirms env vars loaded (e.g. shows whether a session exists)
- `/lib/utils.ts` with `cn()` helper
- ESLint + Prettier configured
- Initial migration applied (the one in `/supabase/migrations/0001_init.sql`)

**Out of scope:** auth UI, trip creation, anything user-facing beyond the
placeholder.

---

## Goal 1.5 — Repo hygiene [ ] *(new, from audit)*

**Definition of done:**
- `.github/ISSUE_TEMPLATE/` with `feature.yml`, `bug.yml`, `research.yml`
- `.github/pull_request_template.md` requires: linked issue, test plan,
  screenshot on iOS Safari for UI changes
- `.github/dependabot.yml` — weekly, grouped, npm + github-actions
- `.github/workflows/ci.yml` — pnpm typecheck + lint + test on PR
- Branch protection on `main`: require CI green, no force-push, no deletion
- Repo settings: secret scanning + push protection + private vulnerability
  reporting enabled
- Vitest installed + configured + 1 example unit test for `cn()`
- Playwright installed + configured + 1 example E2E for "home page loads"
- Audit-recommended labels live in repo (see `notes/research/audit.md`)

**Why before Goal 2:** Goal 2 produces the first real PRs (auth, trip
creation) and the templates/CI need to exist to make those PRs useful.

---

## Goal 2 — Auth + Trip creation [ ] *(DoD expanded from audit)*

**Definition of done:**
- `/login` page: enter email, get magic link
- `/auth/callback` route handles redirect and creates a session
- `/trips/new` page: logged-in users can create a trip (name, dates,
  location, description)
- On creation, the creator is added to `trip_members` as `organizer`
- `/trips/[tripId]` shows a minimal dashboard with trip name, dates, and a
  shareable invite link (`/invite/[token]`)
- `/invite/[token]` route: if logged in, adds user to trip and redirects;
  if not, prompts login first
  - **Honors `invites.uses_left` and `expires_at` (schema already supports)**
  - **Decrement `uses_left` on accept via SECURITY DEFINER function**
- **RSVP UI: 3-state control (going / maybe / declined) wired to existing
  `trip_members.rsvp_status` column**
- **Dietary / sober / allergy free-text field on member profile (new column
  on `trip_members.dietary_notes`)**
- **Per-day attendance: new table `trip_member_days (trip_id, user_id, date,
  status)` so a member can opt into a subset of trip days**
- **Co-organizer role: `alter type trip_role add value 'co_organizer'` and
  update `is_trip_organizer()` to include both**
- RLS policies for `trips`, `trip_members`, `invites`, `trip_member_days`
- Header with user avatar + logout
- **Open Graph card for `/invite/[token]` and `/trips/[slug]` (trip name,
  dates, host avatar, attendee count)**

---

## Goal 3 — Availability poll [ ]

**Definition of done:**
- Organizer can propose candidate date ranges on the trip
- Each member sees a list of dates, picks yes/no/maybe per date
- Persists to `availability` table via server action
- Aggregated view shows count per date with member names on hover/tap
- Mobile-optimized: usable with thumbs while standing on a subway

---

## Goal 4 — Announcements + realtime [ ]

**Definition of done:**
- `announcements` table populated via server action (organizer-write,
  member-read per RLS)
- Organizer can post; everyone can read
- Supabase Realtime subscription so new announcements appear without refresh
- Optional: pinned announcement shows at top of trip dashboard
- **Decision: announcements stay one-to-many; no real chat for MVP. Use
  group text. See `decisions.md`.**
- Stretch: email digest via Resend on new announcements

---

## Goal 5 — Itinerary builder [ ]

**Definition of done:**
- Day-by-day view of the trip (auto-generated from start/end dates)
- Add/edit/delete `itinerary_items` (title, start time, location, notes,
  cost estimate)
- Click an address → opens in Google/Apple Maps
- Mobile view is a vertical timeline; desktop can be denser
- **Calendar export (ICS) per trip — one endpoint, generated on demand**

---

## Goal 6 — MVP polish + ship [ ] *(DoD expanded from audit)*

**Definition of done:**
- Custom domain wired up in Vercel
- Theming pass: party-specific colors, hero, name
- Mobile QA across iOS Safari and Android Chrome
- **PWA manifest + apple-touch-icon (Add to Home Screen on iOS)**
- **Sentry installed (server + browser, source maps)**
- **Vercel Analytics enabled**
- **Rate limiting on `createTrip`, `acceptInvite`, `postAnnouncement` (Upstash
  or Supabase-based limiter)**
- **`/legal/terms` and `/legal/privacy` stub pages live (see
  `notes/moderation.md`)**
- **axe-core / Lighthouse a11y pass per UI route in DoD checklist going
  forward**
- Send invite link to actual party attendees
- **Stop here. Use it for the real trip. Come back after.**

---

## Goal 6.5 — Money pool (manual) [ ] *(new, from audit)*

Highest-asked feature in bachelor-party planning forums per the audience
research. Ships the *coordination* of money, not actual fund movement.

**Definition of done:**
- New table `money_pool_entries (trip_id, user_id, amount_cents, status,
  marked_paid_at)` with RLS
- New table `payment_handles (user_id, provider, handle)` for Venmo /
  Cash App / Zelle usernames per user
- `/trips/[tripId]/money` page: organizer sets per-attendee amount due,
  attendees see "you owe Jake $400 — pay via Venmo" with a deep link
- Manual "mark paid" toggle for the organizer
- No payment processing — explicitly documented in UI as informational

---

## Goal 7 — Expenses + photos [ ] *(adjusted from audit)*

**Definition of done:**
- `expenses` + `expense_splits` flows (schema already exists)
- Add expense: who paid, how much, what for, who owes
- Per-member balance view ("you owe Alex $42")
- **Settlement-suggestion algorithm to minimize number of transfers (Settle Up pattern)**
- Photo upload via Supabase Storage, shared photo wall view
- **`photos.expires_at` column with default of 90 days; archived photos
  exempt (audit risk #3 mitigation)**
- **Per-trip storage cap enforced to bound Supabase Storage cost**
- **Photo report/takedown flow (mailto:link plus a `reports` table)**

---

## Goal 8 — Multi-tenant pivot [ ]

**Definition of done:**
- Landing page at `/` with marketing copy
- Anyone can sign up, create a trip, invite friends
- Trip templates: bachelor party, bachelorette, ski trip, wedding weekend,
  generic — each pre-populates itinerary categories
- Basic dashboard listing all trips a user is in
- Soft launch to a few friends; gather feedback
- **PostHog (or equivalent) for product analytics**
- **Plan Supabase Pro upgrade if storage / row counts approach free-tier
  ceiling**

---

## Notes on running each goal

- Keep PRs small. One feature = one branch = one preview URL.
- Test on your actual phone before merging — desktop responsive mode lies.
- If you finish a goal in under an hour, you probably under-scoped the
  acceptance criteria. Add more or polish.
- If you're stuck past two hours, the goal was probably too big — split it.
