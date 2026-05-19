# Audit Round 2 — Big-Picture Gap Analysis

> Source: architect subagent, 2026-05-18. Follow-up to `audit.md` (round 1).
> 20 findings. Opinionated. Where a current decision is right, confirmation is stated explicitly so it's not assumed.

---

## Critical gaps — must address before MVP ships

### 1. Add `trip_kind` column to `trips` from day one
**What:** No `kind` enum (`bachelor | bachelorette | ski | wedding_weekend | generic`) on `trips`. Goal 8 adds templates, but the *column* is what's load-bearing — every later filter, default-itinerary seed, theming hook, and analytics cut depends on it.

**Why now:** Adding the column post-launch is trivial. Backfilling untyped trips with heuristics, and writing conditional migrations, is not.

**Action:** Goal 2 migration adds `trips.kind trip_kind not null default 'bachelor'`. Single enum value for now; extend later. Also add `trips.is_template boolean default false` so trips can be cloned later without a separate `templates` table.

---

### 2. Add generic `visibility` primitive across user-content tables
**What:** Per-field surprise visibility is the differentiator, but there's no generic primitive. Sprinkling `visible_to_groom boolean` across 5 tables is the retrofit-painful path.

**Why now:** Itinerary items, announcements, expenses, polls, photos all need this. The right primitive is:
- `visibility` enum on each user-content row: `everyone | organizers_only | hide_from_celebrant | custom`
- Plus `content_visibility_grants (content_type, content_id, user_id)` join table for custom audiences

**Action:** Add `visibility trip_visibility not null default 'everyone'` to `itinerary_items`, `announcements`, `polls`, `expenses` in their respective ship-migrations. **Must land in Goal 2 if any user content is created in Goal 2** (the invite + initial itinerary placeholder counts).

---

### 3. Add `is_celebrant` flag on `trip_members`
**What:** Roles are `organizer | co_organizer | member`. No way to mark "this person is the groom/bride/birthday-haver." But that's the *only* attendee that matters for surprise filtering.

**Why now:** `is_celebrant` is one column. Without it, you can't write `using (visibility <> 'hide_from_celebrant' or not is_celebrant)` in RLS. Retrofitting after Goal 7 = rewrite every visibility policy.

**Action:** Add `trip_members.is_celebrant boolean not null default false` plus partial unique index (`where is_celebrant`) capped at one per trip in Goal 2. For other trip kinds without a celebrant (ski trip), `false` is fine.

---

### 4. Decouple `trip_members.user_id` from `profiles` — accountless attendee mode
**What:** Current schema requires every `trip_members.user_id` to point at an authed `profiles` row. The one guy who won't download anything has no path in. Splid's wedge ("host has account, attendees don't") is gated by this.

**Why now:** Decoupling `trip_members` from `profiles` post-launch is one of the worst refactors in any social app. RLS policies, every FK, every `/lib/db/` query — all touched.

**Action:** Make `trip_members.user_id` nullable; add `trip_members.display_name`, `phone_e164`, `email`. Member upgrades to authed user on first magic-link. Non-trivial RLS rewrite — must land before Goal 2 ships or it bakes in forever.

---

### 5. Idempotency keys on mutation tables
**What:** Invite acceptance, RSVP, money-pool "mark paid" — no idempotency keys. Drunk user double-taps → two entries.

**Why now:** Server actions are POST-redirect, easy to double-submit on poor cell signal (the actual use case). One column + one unique index.

**Action:** Add `idempotency_key uuid` with partial unique index to `money_pool_entries`, `expenses`, `announcements` as each ships. Generate client-side per action invocation.

---

## High-value adds for MVP

### 6. Lodging / room assignments as first-class itinerary subtype
Bachelor parties spend $400–$800/head on lodging; *who's rooming with who* is in every group text. Add `itinerary_item_kind` enum (`event | lodging | transport | meal | activity`). For `lodging`, attach `lodging_assignments (item_id, user_id, room_label)`. **In Goal 5 DoD.**

### 7. Travel legs / arrivals manifest
The most-checked screen day-of-trip after "what's next" is *"who's at the airport?"* Add `travel_legs (trip_id, user_id, kind, depart_at, arrive_at, carrier, confirmation_code, notes)`. Renders as arrivals board day 1. **Don't build flight parsing** (TripIt has 10 years' head start) — accept freeform text. **Goal 5 add, not deferred.**

### 8. "Quick tab" / on-trip running tally separate from formal expenses
Nobody opens a "log this expense" form during a trip. They want one-tap: *"$80 dinner, I covered, split 8 ways, done."* This is the difference between Splitwise (post-trip) and Splid (during). Goal 7's expense flow assumes formal entry — **add single-tap "quick tab" mode** (defaults: payer = me, split = everyone-RSVP'd-and-present-today) that becomes a real expense row. Per-day-attendance integration is the unlock.

### 9. Settlement closer / post-trip recap — pull forward to Goal 7
ROADMAP has no "trip is over, now what" surface. Settle-up is when people remember the app. Lock the ledger, generate simplified transfer set, email everyone: *"You owe Jake $42 — pay via Venmo [link]. Photos archived. Tap to download album."* **80% built from existing pieces — pull forward to Goal 7, not Goal 8.** This is also the conversion moment from one-shot trip to multi-tenant funnel.

### 10. Groom's "fear list" / advisory input
Free-text *"things to avoid"* (allergies, no strip clubs, no surprise calls to my MIL, hard hangover budget). Celebrant writes; organizers + co-organizers read; everyone else doesn't. **Tiny feature, enormous goodwill.** Natural intro to the visibility primitive in #2. **Goal 2, right next to dietary notes.**

---

## Post-MVP but design-now

### 11. Notifications abstraction (the seam, not the feature)
Resend is mentioned as Goal 4 stretch. **Don't ship even one ad-hoc `resend.emails.send()` from a server action** — once you do, every later channel (SMS, push, in-app) becomes a parallel ad-hoc call. Build a `notifications` outbox table + single dispatcher from day one. Sentry stays Goal 6; the seam goes in at Goal 4.

### 12. Per-trip display name override
`profiles.display_name` is global. Goal 8 will want "Jake (Best Man)" for one trip and "Jake Smith" for another. Add `trip_members.display_name_override text nullable` now; rendering helper coalesces. **Multi-tenant pivot = UI change, not migration.**

### 13. Soft-delete + archive on trips
`trips.deleted_at` and `trips.archived_at` from day one. Goal 8 multi-tenant + best-man churn risk both need this. **Hard-delete is wrong as default** — data outlives organizer's interest.

### 14. Expense category enum
`expense_category` (`lodging | food | activity | transport | misc`). Without it, post-trip recap can't show *"we spent 42% on lodging."* Also seed for Goal 8 template-specific default categories. **One enum, one column.**

### 15. Audit log / change feed
Generic `audit_log (trip_id, actor_user_id, table_name, row_id, action, before_jsonb, after_jsonb, occurred_at)` via Postgres triggers on money + RSVP + itinerary tables. Money is the #1 pain point — *"who changed my owed amount"* is the #1 complaint when it goes wrong. **Goal 6.5 sub-task.**

---

## Kill / defer recommendations

### 16. KILL: Stretch email-digest in Goal 4
Goal 4 already has realtime + announcements. Email digest on top = third notification channel without retention/preference plumbing. **Defer post-MVP, after #11's notification abstraction.**

### 17. DEFER: Trip templates breadth in Goal 8 (keep `trip_kind` column from #1)
Five templates (bachelor / bachelorette / ski / wedding-weekend / generic) at Goal 8 is over-scoped. **Ship Goal 8 with two templates** (bachelor + generic). The `kind` enum supports more; seed data doesn't have to.

### 18. DEFER: PostHog at Goal 8
Vercel Analytics + Sentry at Goal 6 covers 95%. PostHog cost = config complexity, 3rd script tag, privacy-policy update for session replay. **Push to post-Goal-8-soft-launch.**

---

## Cross-cutting flags

### 19. Accessibility — explicit conventions, not just linting
axe-core catches landmarks + contrast. It does **not** catch:
- Deaf groomsman needing transcripts on announcement audio
- Colorblind organizer reading green/yellow/gray RSVP dots

**Two binding commitments:**
1. **Never encode meaning in color alone.** RSVP states need shape/icon too (check, question, X).
2. **Announcements text-only in MVP.** No audio/video-only posts. If voice notes ship later, transcription mandatory.

Add to CLAUDE.md or `/notes/accessibility.md`.

### 20. Legal beyond ToS stub
- **Activity waivers:** shooting ranges, ATV, paintball, skydiving require venue waivers. App should **not collect** waivers (liability) but **should remind** organizers via a tag on `itinerary_item_kind`.
- **Alcohol-coded language:** bachelor template defaults to "bar crawl," "open bar." Generic + wedding-weekend templates **must not inherit** those defaults. Goal 8 concern, but template-seed precedent is set in Goal 1.
- **Currency/i18n:** not MVP. **But `expenses.amount_cents` assumes USD implicitly.** Add `currency char(3) default 'USD'` now — saves painful migration when destination-wedding-in-Mexico shows up.

---

## Decisions confirmed (not assumed)

- **Money pool informational only (no Stripe Connect at MVP):** ✅ Correct. KYC/MSB risk enormous; Venmo-deep-link captures value.
- **No real-time chat (use GroupMe / iMessage):** ✅ Correct. Trying to replace group text is unwinnable.
- **Photos expire at 90 days default:** ✅ Correct. "Archive to keep" opt-in = right default-conservative posture for UGC liability.
- **Multi-tenant from day one via RLS:** ✅ Correct. Cost small; retrofit catastrophic.

---

## Bottom line

The MVP roadmap is mostly right. **Five things to lock in before Goal 2 ships:**

1. `trip_members.is_celebrant`
2. `visibility` enum on user-content tables
3. `trip_kind` column on `trips`
4. Decoupling `trip_members.user_id` from `profiles` (accountless attendees)
5. Idempotency keys on mutation tables

Everything else can iterate.
