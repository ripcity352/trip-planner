# Roadmap

> Source of truth for the shipping plan. Public surface
> [`ROADMAP.md`](../ROADMAP.md) regenerates from this file.
>
> Restructured 2026-05-19 after a multi-perspective review (architect +
> 3 personas + mobile-UX + product strategy). Pre-2026-05-19 history:
> the original Goal 1 / 1.5 / 1.6 / 2 / 3 / 4 / 5 / 6 / 6.5 / 7 / 8
> sequence is preserved in git; the synthesis that produced it is
> [`synthesis-2026-05-18.md`](./synthesis-2026-05-18.md). Cuts and
> deferrals from the 2026-05-19 review live in
> [`killed-and-deferred.md`](./killed-and-deferred.md).

The MVP target is **one real bachelor party.** Ship M1 → M4. **Stop at M4.**
Use it for the trip. Come back to M5 only after a real-trip retro.

---

## M1 — Foundation + Schema

Infrastructure + the schema primitives that every later milestone keys
off. PWA / Sentry / rate-limiting are infra, not polish, so they land here.

**Status (2026-05-19):** All PRs authored and green on CI. Awaiting merge:
#86, #87, #88, #89, #91, #92, #93. Merge order documented in
`notes/m1-execution-plan.md`. Milestone closes when all checkboxes in the
DoD section of the execution plan are checked.

**Definition of done:**
- Next.js 16 app with strict TypeScript, deployed to Vercel preview
- Tailwind + shadcn/ui initialized
- Supabase server + browser clients in `/lib/supabase/`, session refresh
  in middleware
- ESLint + Prettier configured
- `.github/` hygiene: issue templates, PR template (with microcopy
  review checklist), Dependabot, CI workflow (typecheck + lint + test)
- Branch protection on `main`; secret scanning + push protection
- Vitest + Playwright with one example each
- PWA manifest + apple-touch-icon
- Sentry installed (server + browser, source maps)
- Vercel Analytics enabled
- Rate-limiting middleware seam (Upstash or Supabase) — applied to
  `createTrip`, `acceptInvite` initially
- `/lib/copy/empty-states.ts` and `/lib/copy/errors.ts` written upfront
  in the app voice
- **Foundation migration** applied, containing:
  - `trip_kind` enum (single value `bachelor` for MVP)
  - `is_template`, `deleted_at`, `archived_at` on `trips`
  - `is_celebrant` on `trip_members` + partial unique index
  - **Synthetic PK** on `trip_members.id` + FK retargeting convention
    (feature tables reference `trip_member_id`, not `user_id`)
  - `user_id` nullable on `trip_members` + `display_name` / `phone_e164` /
    `email` (using `citext`) columns
  - `trip_visibility` enum + RLS helper `can_see_content(trip_id,
    visibility, content_id)`
  - `trip_members_visible_rsvp(viewer_id)` view — schema-enforced
    "declining whispers"
  - `trip_member_days` table + auto-seed on RSVP=going
  - `vibe_tags text[]` on `trips`
  - `currency char(3) default 'USD'` on money columns (per-table as money
    tables ship in M5)
  - Idempotency-key convention documented (`notes/database-workflow.md`)
    — scope is per-table, not uniform

**Out of scope (deferred to M5):** `audit_log`, `content_visibility_grants`,
`display_name_override`.

**Reading list:** `notes/research/audit-round-2.md` §1–6, architect review
from 2026-05-19 (in git history if needed).

---

## M2 — Trip is real

Login, trip creation, invites, RSVP, bach-specific date selection,
logged-out invite preview. Stripped Goal 2 — Fear List swipe / Crew Cards
/ OG cards / dietary notes column are killed or moved (see
`killed-and-deferred.md`).

**Definition of done:**
- Magic-link auth at `/login` + `/auth/callback`
- `/trips/new` creates a trip with `kind = 'bachelor'`; creator is
  organizer, not celebrant
- `/invite/[token]` shows a **logged-out preview** (trip name + dates +
  host name + attendee count) before forcing login. Invite acceptance
  decrements `uses_left` via SECURITY DEFINER function.
- Trip dashboard shows trip name, dates, invite link, glanceable
  confirmed-count ("3 going, 1 maybe, 4 invited" — never per-name for
  declines per M1 RLS)
- 3-state RSVP UI (going / maybe / declined) on dashboard
- Co-organizer role: `co_organizer` enum value; `is_trip_organizer()`
  returns true for both. **No spend cap yet** (deferred to M5).
- **Trip date selection — celebrant-weighted** for bach kind. Organizer
  proposes 2–4 candidate windows → celebrant marks works /
  works-with-effort / no-go → other members vote only on windows the
  celebrant didn't veto.
- Reusable `<PulsePoll>` component (Supabase Realtime) — **aggregate-only
  by default**; per-name vote visibility is voter opt-in.
- Header with avatar + sign-out
- Every UI string sourced from the M1 copy palettes; PR template
  enforces microcopy review

**Status (2026-05-19):** All PRs landed on `main` with CI green and reviewer approval. See `notes/decisions.md` "M2 — Trip is real — milestone closed" entry. Authenticated multi-actor e2e + persimmon design-token wiring trail in the follow-up issues.

**Out of scope:** Fear List swipe (#29 killed), Crew Cards (#31 killed),
dietary as a profile column (moved to M3 as per-item flag), OG cards (M5).

---

## M3 — Trip is useful

Itinerary first (swapped before announcements per product review — the
itinerary is what attendees open the app *for*). Then announcements +
realtime.

**Definition of done:**
- **Itinerary**
  - Day-by-day view auto-generated from start/end dates
  - `itinerary_items` with `kind` enum (event / lodging / transport /
    meal / activity), `activity_tag` (multi), `dress_code` text
  - Items inherit `visibility` enum (so `hide_from_celebrant` works
    end-to-end)
  - Add / edit / delete via server actions (idempotency keys)
  - Click address → opens Maps deep link
  - Mobile-first vertical timeline at 375px
- **"What's happening right now / next" home card** — single answer in
  <1s glance: next item title, time, location. Pre-trip shows
  countdown + first item.
- **Editable trip-level FAQ / notes field** (`trips.notes text`) —
  freeform markdown, organizer-edit, member-read
- **Per-item RSVP** — schema + one-tap silent opt-out chip per item.
  Default state: going for any item on a day the member RSVPd going.
  Opt-out is silent (no notification, no peer visibility).
- **Per-item dietary / participation flag** (`itinerary_item_member_flags`) —
  generic mechanism, organizer-visible only. Replaces profile-column
  dietary notes.
- **Lodging assignments** — `lodging_assignments (item_id,
  trip_member_id, room_label)`
- **Travel legs / arrivals manifest** — `travel_legs (trip_id,
  trip_member_id, kind, depart_at, arrive_at, carrier, confirmation_code,
  notes)`. Freeform — no flight parser.
- **vCard mass-download** + **"Copy all numbers"** — for iMessage
  group-chat creation friction
- **Announcements** — organizer-write, member-read; visibility enum
  respected; Supabase Realtime subscription on dashboard. Idempotency
  scope `(trip_id, idempotency_key)`. **No outbox/dispatcher seam**
  (killed as #33).
- **No chat / replies** — use group text (decision preserved from
  pre-2026-05-19 synthesis)

**Out of scope:** Pin Drops (#32 killed), ICS export (#41 killed),
balance-audit nudges, notification-outbox seam (#33 killed).

---

## M4 — Trip is shippable

The ship moment. Polish + the bright line marked **STOP HERE.**

**Definition of done:**
- Custom domain wired up in Vercel
- Theming pass: party-specific colors, hero image, party name
- Mobile QA across iOS Safari and Android Chrome
- **Microcopy review** enforced as PR-template checklist for any UI string
- **`/legal/terms` and `/legal/privacy` stub pages** — pass the voice test
- **axe-core + Lighthouse a11y pass** per UI route
- **Color is never the only signal** — RSVP/state icons accompany color
- **Send invite link to actual party attendees**
- **Stop here.** Use it for the real trip. Come back to M5 only after a
  retrospective surfaces what the trip actually needed.

**Out of scope:** every delight mechanic deferred to M5 (Drumroll,
Lock-In Day, Hot Seat — all killed; can earn back via retro).

---

## M5 — Earned post-trip

Gated on a real-trip retrospective. Items here are *valid* and *might
ship* — they're just not in MVP. Each earns its way in by surviving the
retro, not by being on this list.

Current shape (see GitHub `M5 — Earned post-trip` milestone for live
list):

- **Money pool (manual)** — itemized line items, per-day proration,
  silent comping, 3-tier nudge escalation, Money-Front badge
  (organizer-private only), `audit_log` triggers narrowed to money
  tables
- **Expenses + photos** — `expense_category` enum, Quick Tab mode,
  Settlement Closer (single-Venmo-link-per-person), Supabase Storage
  photo wall, Disposable Cam, Group Recap stub, Splitwise deep-link
- **Multi-tenant pivot** — `bachelor` + `generic` template configs
  only at first launch
- **Retention engine** — Time Capsule (1-year anniversary), Recap Card
  per attendee, Live Now during-trip mode, Hype Memos (voice memos
  pre-trip)
- **Re-evaluated delight (earned back via voice library + design
  rigor)** — Drumroll, Lock-In Day OG share card, Hot Seat copy
- **Deferred infrastructure** — `audit_log` (re-design when revived),
  `content_visibility_grants` (design under requirements),
  `display_name_override`, notification outbox / dispatcher (when a
  second channel arrives)
- **Research spikes** — AI itinerary extraction (Anthropic API +
  Resend inbound), Apple + Google Wallet pass feasibility

---

## Cross-cutting (apply at every milestone)

- **Voice test:** every UI string passes *"would you say this at a
  pre-trip dinner?"*
- **Don't encode a default:** per-item granular primitives; non-default
  attendees opt INTO participation
- **Visibility-first feature design:** decide default visibility before
  coding any user-content table
- **Idempotency:** every mutation server action accepts a
  client-generated `idempotency_key`; mutation-heavy tables have the
  column + unique index (scope per-table — see `notes/database-workflow.md`)
- **Currency on money fields:** every money column ships with a
  `currency char(3) default 'USD'` sibling
- **Going broadcasts, declining whispers:** enforced schema-side via the
  `trip_members_visible_rsvp` view + aggregate-only Pulse Poll defaults
- **Mobile-first 375px:** every UI route tested on actual phone before
  merge — desktop responsive mode lies

## Anti-patterns hard-banned across all milestones

From `notes/research/fun-and-delight.md` + 2026-05-19 review:

- No leaderboards (RSVP speed, payment, photo count, votes — any kind)
- No streaks; no Duolingo owl
- No achievement unlocks / badges
- No notification-preferences settings screen (one smart default + OS
  mute)
- No tooltips, onboarding banners, "complete your profile" prompts,
  progress bars, completion scores
- No required fields with asterisks
- No anthropomorphized mascot
- No reaction inflation (cap at ~6 fixed emoji)
- No penis-anything in UI / assets / copy
- Push notifications are for LOGISTICS only (cliff dates / day-of /
  payment due) — never for "Pete added a photo"
- Per-name "going / declining" poll visibility default → never (must be
  voter opt-in)
- Naming the last-to-RSVP person → never
- Group-visible "outstanding payment" lists → never (aggregate-only when
  shared)

## Notes on running each milestone

- Keep PRs small. One feature = one branch = one preview URL.
- Test on your actual phone before merging — desktop responsive mode lies.
- If you finish a milestone in under a day, you under-scoped — add polish.
- If you're stuck past a week on M1, the foundation cut was too big — split.
- Per-task tooling recommendations live in
  `notes/research/tooling-and-skills.md` §2.
- Before starting any milestone: skim `notes/research/INDEX.md` for the
  relevant persona + UX principles + audit findings.
