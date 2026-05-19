# Synthesis — Research → Roadmap (2026-05-18)

> Master decision doc consolidating 8 research artifacts in `notes/research/`.
> Read this *instead of* re-reading every research file. Links inline.

---

## Principles locked (the holding bar)

1. **Helpful, not burdensome.** Sections of the app can be used or skipped per trip. *"Like Partiful, not like Asana."* See [ux-design-principles.md](./research/ux-design-principles.md).
2. **Orchestrator > rebuilder.** Integrate with services that already do their job well; build only where there's a clear gap. See [integration-feasibility.md](./research/integration-feasibility.md).
3. **Don't encode a default.** Granular per-item primitives (per-item RSVP, per-item cost, per-item dietary, per-item visibility) — non-default attendees opt INTO participation, not out of assumptions. See [persona-edge-attendees.md](./research/persona-edge-attendees.md).
4. **Glanceable beats comprehensive.** Every screen answers one question in <1 second.
5. **Delight is load-bearing, not decorative.** Reserved for group milestones (Lock-In Day, photo-roll develops, trip-complete) — never per-action confetti. Hard ban on streaks, leaderboards, achievement unlocks. See [fun-and-delight.md](./research/fun-and-delight.md).
6. **Roles are personality, not just permissions.** Same DB column, layered UI affordances per role.
7. **Going broadcasts; declining whispers.** State changes have asymmetric notification policy.
8. **Voice test:** *Would you say this out loud at a pre-trip dinner?* If yes, ship. If it sounds like a SaaS onboarding email, rewrite.

---

## Critical: schema primitives that MUST land before Goal 2 ships

From [audit-round-2.md §1–5](./research/audit-round-2.md). Each is a one-line ALTER or a small migration; retrofitting after Goal 2 ships is 10× harder.

| # | Primitive | Migration | Why now |
|---|---|---|---|
| 1 | `trips.kind trip_kind not null default 'bachelor'` + `trips.is_template boolean default false` | new enum + 2 cols | Every later filter, template seed, theming hook, analytics cut depends on this column existing |
| 2 | `visibility trip_visibility not null default 'everyone'` on user-content tables (`itinerary_items`, `announcements`, `polls`, `expenses`) + optional `content_visibility_grants` join | enum + cols per table as each ships | Per-field surprise is the differentiator. Sprinkling `visible_to_groom boolean` is the retrofit-painful path |
| 3 | `trip_members.is_celebrant boolean not null default false` + partial unique index (one celebrant per trip) | 1 col + 1 index | The only attendee that matters for surprise filtering. Without this, every visibility RLS policy needs rewriting later |
| 4 | Decouple `trip_members.user_id` from `auth.users` — make nullable, add `display_name`, `phone_e164`, `email` cols | non-trivial RLS rewrite | Splid's "host has account, attendees don't" wedge. Refactor post-launch is one of the worst in social apps |
| 5 | `idempotency_key uuid` + partial unique index on mutation-heavy tables (`money_pool_entries`, `expenses`, `announcements`) | 1 col + 1 index per table | Drunk user on bad cell signal double-taps → 2 entries. This is the actual use case |

**Plus one from [integration-feasibility.md](./research/integration-feasibility.md):**

| 6 | `expenses.currency char(3) not null default 'USD'` | 1 col | `amount_cents` assumes USD implicitly. Destination-wedding-in-Mexico breaks this. One col now = no migration pain later |

**Action:** these become Goal 2 sub-issues *with `priority:high` and `area:rls`*. Block Goal 2 main work until they land.

---

## MVP changes by goal

### Goal 2 — Auth + Trip creation (DoD additions)

Already in DoD per round 1 audit: RSVP UI, dietary notes, per-day attendance, co-organizer role, OG card. Adding:

- The six schema primitives above
- **Fear List** — private celebrant intake (3 swipe cards: strippers / helicopter / karaoke style). Writes vibe tags. ([fun-and-delight.md mechanic #4](./research/fun-and-delight.md))
- **Vibe tags** as soft-constraint mechanism (e.g., `no-strippers`, `phones-down-at-dinner`). Used as defaults for activity suggestion + visible filter on itinerary items. ([persona-groom.md](./research/persona-groom.md))
- **Crew Cards** — basic member directory with self-authored 1-line bio + photo + how-they-know-the-celebrant. Solves +1 Bridge anxiety. ([fun-and-delight.md mechanic #6](./research/fun-and-delight.md))

### Goal 4 — Announcements + realtime (additions)

- **Pin Drops** table — single-tap "flag this moment" from Live Now. Same realtime channel as announcements. Becomes chapters in post-trip recap. ([fun-and-delight.md mechanic #11](./research/fun-and-delight.md))
- **Notification outbox table + dispatcher seam** — even if MVP only writes Realtime broadcasts. Don't ship an ad-hoc `resend.emails.send()`; it becomes parallel ad-hoc calls per channel. ([audit-round-2 #11](./research/audit-round-2.md))
- **KILL: email digest stretch** — defer until notification abstraction lands. ([audit-round-2 #16](./research/audit-round-2.md))

### Goal 5 — Itinerary builder (additions)

- `itinerary_item_kind` enum: `event | lodging | transport | meal | activity`
- `activity_tag` field: `bar | club | meal | outdoor | gaming | chill | apres` etc. — drives balance audit ("you have 4 bar events and 0 daytime")
- `dress_code` field — kills 100 anxious DMs
- **Lodging assignments table** — `lodging_assignments (item_id, user_id, room_label)` ([audit-round-2 #6](./research/audit-round-2.md))
- **Travel legs table** — `travel_legs (trip_id, user_id, kind, depart_at, arrive_at, carrier, confirmation_code, notes)`. Renders as arrivals board day 1. **Don't build flight parsing** — accept freeform text. ([audit-round-2 #7](./research/audit-round-2.md))
- **Per-item RSVP** — opt out of the 1am club leg without explaining ([persona-edge-attendees.md](./research/persona-edge-attendees.md) sober + family attendee)
- **vCard contact export** — single multi-contact `.vcf` download (vCard 3.0); iOS Safari → Mail → "Add All N Contacts." User's explicit ask. ([integration-feasibility.md §5](./research/integration-feasibility.md))
- **"Copy all numbers" button** — best partial-solve for iMessage groupchat creation (no URL scheme exists)
- **ICS calendar export** — per-attendee signed JWT URL, only items they RSVP'd `yes` to. webcal:// + https://. UTC or VTIMEZONE blocks ([integration-feasibility.md §4](./research/integration-feasibility.md))

### Goal 6 — MVP polish + ship (additions)

- **Lock-In Day card** — full-bleed group moment when last person RSVPs. OG share card via `ImageResponse`. ([fun-and-delight.md mechanic #2](./research/fun-and-delight.md))
- **Drumroll** — 3-sec build on invite open ([fun-and-delight.md mechanic #1](./research/fun-and-delight.md))
- **Hot Seat copy mechanic** — one file of voice templates → app picks 1 attendee per closed poll/locked-date and writes 1 affectionately-roasty line ([fun-and-delight.md mechanic #5](./research/fun-and-delight.md))
- **Microcopy review checklist** in PR template: every UI-touching string passes voice test
- **axe-core + Lighthouse pass per UI route** (already in DoD)
- **Color is never the only signal** — RSVP/state needs shape/icon too (accessibility commitment) ([audit-round-2 #19](./research/audit-round-2.md))

### Goal 6.5 — Money pool (additions)

- **Itemized line items with per-line opt-in** (NOT equal-split-everything default) — broke friend + family attendee personas
- **Proration by days attended** — late-arrival persona; money pool reads `trip_member_days` automatically
- **Silent sponsorship / comping flow** — groom covers brother's share with no public line item
- **3-tier nudge escalation** — 7d / 14d / 21d (best-man persona)
- **Audit log table** (`audit_log (trip_id, actor_user_id, table_name, row_id, action, before_jsonb, after_jsonb)`) populated by Postgres triggers — "who changed my owed amount" forensics ([audit-round-2 #15](./research/audit-round-2.md))
- **Stripe Connect language hygiene:** "deposit + delayed payout" never "escrow" — Stripe has no escrow product. Stays informational/deep-link only for MVP. ([integration-feasibility.md §2](./research/integration-feasibility.md))

### Goal 7 — Expenses + photos (additions / replacements)

- `expense_category` enum: `lodging | food | activity | transport | misc` — feeds Group Recap stats ([audit-round-2 #14](./research/audit-round-2.md))
- **Quick Tab mode** — single-tap "$80 dinner, I covered, split everyone present today, done." Splid-during, not Splitwise-post. ([audit-round-2 #8](./research/audit-round-2.md))
- **Settlement closer** — pull forward from "post-MVP" — lock the ledger, generate simplified transfer set, single-Venmo-link-per-person, email everyone ([audit-round-2 #9](./research/audit-round-2.md))
- **Disposable Cam mode** — `developed_at` timestamp on photos; photos hidden until 24h post-trip end. ([fun-and-delight.md mechanic #10](./research/fun-and-delight.md))
- **Group Recap stub** — auto-generated web page summary at trip end (hero photos, pin drops, expense category breakdown, no per-person money breakdown). Full recap card per attendee is Goal 8. ([fun-and-delight.md memory-as-product](./research/fun-and-delight.md))
- **Photos use Supabase Storage**, not Google Photos — Google's sharing API was killed March 2025 ([integration-feasibility.md §3](./research/integration-feasibility.md))
- **Photo `expires_at` default 90 days, archive opt-in** (already in roadmap)
- **Per-trip storage cap** to bound cost (already in roadmap)
- **Splitwise integration** = deep-link prefill only (free-tier caps at 3 writes/day) — NOT full bidirectional sync

---

## Post-MVP, design-now

These are NOT in MVP DoD but the *seam* must exist so adding them is a UI change, not a migration:

- **Per-trip display name override** — `trip_members.display_name_override text nullable` now. ([audit-round-2 #12](./research/audit-round-2.md))
- **Soft-delete + archive on trips** — `trips.deleted_at`, `trips.archived_at` from day one. ([audit-round-2 #13](./research/audit-round-2.md))
- **Notification dispatcher abstraction** (above)
- **Apple Wallet + Google Wallet passes** — Phase 2. Requires $99/yr Apple Developer membership. ([integration-feasibility.md §7](./research/integration-feasibility.md))
- **AI itinerary extraction** — paste forwarded reservation email or screenshot → structured itinerary item via Anthropic. Cheap, high-value. ([integration-feasibility.md bonus](./research/integration-feasibility.md))
- **Time Capsule** — 1-year anniversary push. THE retention loop for Goal 8. ([fun-and-delight.md memory-as-product](./research/fun-and-delight.md))
- **Live Now** — during-trip home screen mode. ([fun-and-delight.md mechanic #9](./research/fun-and-delight.md))
- **Hype Memos** — 15-sec voice memos dripped pre-trip. ([fun-and-delight.md mechanic #8](./research/fun-and-delight.md))
- **Bar Tab** — organizer-only wins-only feed. ([fun-and-delight.md mechanic #7](./research/fun-and-delight.md))
- **Anonymous comfort-pulse polls** — for organizer; surfaces issues without anyone raising hand. ([persona-edge-attendees.md family attendee](./research/research/persona-edge-attendees.md))

---

## Goal 8 — Multi-tenant pivot (scope changes)

- **Ship with TWO templates** — `bachelor` + `generic`. Bachelorette + Ski are seed-data adds, not first-launch. ([audit-round-2 #17](./research/audit-round-2.md))
- Each template = one config file in `/lib/templates/<template>.ts`: palette, copy strings, default tags, `delightExtras` array. Adding a template = hours not days.
- **Activity waiver flag** on certain `itinerary_item_kind` values (shooting/skydiving/ATV) — *reminds* organizer to confirm with venue, does NOT collect waivers (liability). ([audit-round-2 #20](./research/audit-round-2.md))
- **Alcohol-coded defaults** stay in bachelor template only — generic/wedding-weekend templates do not inherit `bar crawl` defaults
- **Time Capsule + full Recap Card per attendee** ship with Goal 8 — these are the retention loops
- **DEFER: PostHog** — Vercel Analytics + Sentry covers 95%; PostHog adds privacy-policy + session-replay complexity ([audit-round-2 #18](./research/audit-round-2.md))

---

## Kills + Defers

| What | Action | Why |
|---|---|---|
| Email digest stretch (Goal 4) | KILL | No notification abstraction yet. Cf. ad-hoc Resend calls |
| Five templates at Goal 8 | DEFER 3 | Ship bachelor + generic; bachelorette/ski/wedding-weekend after real feedback |
| PostHog at Goal 8 | DEFER | Vercel Analytics + Sentry is enough |
| Spotify collaborative playlists | DEFER → marketing-only | Extended quota is org-only since May 2025; 25-user cap in dev mode |
| Google Photos integration | KILL → LINK-OUT | Sharing API killed March 2025 |
| Splitwise full bidirectional sync | KILL → DEEP-LINK PREFILL | Free-tier caps writes at 3/day, our flow looks broken |
| Resy / OpenTable / Tock direct integration | KILL → LINK-OUT | Partner sales cycle + Resy-Tock merger summer 2026 |
| Airbnb / Vrbo metadata fetch | KILL → URL paste only | Closed partner program; scraping = ToS violation |
| what3words | KILL → use Plus Codes | Paid + lock-in vs free + native to Maps |
| Twilio SMS at MVP | KILL → email-first | A2P 10DLC overhead, email beats SMS in 2026 |
| Uber Pool / carpooling logic | KILL → one-rider deep-links | Uber Pool wound down most US markets |
| Strappy "rate this activity" | KILL | Persona-groom: don't surface Pete's karaoke idea got 2 stars |
| RSVP-speed badges, streaks, leaderboards | HARD BAN | Persona-groom + fun-and-delight anti-patterns |
| Notification preferences settings screen | HARD BAN | UX anti-pattern — one smart default + OS mute |
| Tooltips, onboarding banners, "complete your profile" | HARD BAN | UX anti-pattern |

---

## Cross-cutting

- **Accessibility:** color is never the only signal. Announcements text-only in MVP (audio/video later requires transcription). axe-core + Lighthouse per UI route.
- **Voice:** every UI string passes the "say this at dinner" test. Microcopy review in PR template.
- **Currency-aware money fields** from day one (`currency char(3)`)
- **Idempotency keys** on every mutation-heavy table
- **Visibility primitive** is universal — same enum across `itinerary_items`, `announcements`, `polls`, `expenses`, `pins`, `photos`

---

## New ADRs to write in `notes/decisions.md`

(Order = top-of-file insertion order)

1. **Generic `visibility` enum across user-content tables** — pick (a) enum on row + optional `content_visibility_grants` join. Rationale: per-field surprise is the differentiator; ad-hoc booleans = retrofit pain.
2. **`is_celebrant` flag on `trip_members` from day one** — partial unique index. Rationale: only attendee that matters for surprise filtering.
3. **`trip_kind` enum on `trips` from day one** — single value `bachelor` for MVP; extend at Goal 8. Rationale: column is load-bearing for every later filter/template/theme.
4. **Accountless attendees** — `trip_members.user_id` nullable + display_name/phone/email cols. Rationale: Splid wedge; refactor post-launch is catastrophic.
5. **Idempotency keys on mutation tables** — uuid + partial unique index. Rationale: bad cell signal use case.
6. **Currency-aware money fields** — `currency char(3) default 'USD'` from day one. Rationale: 1 column now vs migration pain at destination wedding.
7. **Photo storage is Supabase, not Google Photos** — Google sharing API killed Mar 2025.
8. **Splitwise = deep-link prefill, not bidirectional sync** — free-tier 3-writes/day cap.
9. **Stripe Connect language: "deposit + delayed payout," never "escrow"** — Stripe has no escrow product.
10. **No SMS at MVP** — A2P 10DLC overhead; email beats SMS in 2026.
11. **Notification outbox + dispatcher seam from Goal 4** — avoid ad-hoc Resend calls.
12. **Tooling defaults** — Supabase MCP authenticated, Vercel MCP authenticated, disable voltagent/figma/shopify plugins (see [tooling-and-skills.md](./research/tooling-and-skills.md)).
13. **App voice/personality is load-bearing** — microcopy review in PR template; voice test ("would you say this at a pre-trip dinner?").
14. **Roles add micro-affordances, not gates** — celebrant doesn't see "you can't edit," sees "Dave's got this."
15. **Don't encode a default** — granular per-item primitives; non-default attendees opt INTO participation.

---

## CLAUDE.md additions (after roadmap lands)

CLAUDE.md should ADD (not rewrite):

- **Visibility primitive convention** — every new user-content table gets `visibility trip_visibility not null default 'everyone'` unless explicitly trip-internal-only
- **Idempotency convention** — every mutation server action accepts a client-generated `idempotency_key`; mutation-heavy tables have the column + unique index
- **Voice test** — for any string that ships in UI: *"would you say this at a pre-trip dinner?"*
- **Don't-encode-a-default principle** — when in doubt about defaults, ask whether a non-default attendee would be forced to opt out. If yes, make it opt-in instead.
- **Visibility-first feature design** — when adding a new content type, decide its default visibility (`everyone | organizers_only | hide_from_celebrant`) before coding
- **Currency on money fields** — every money column ships with a `currency` sibling
- **MCP/tooling pointer** — link to `notes/research/tooling-and-skills.md` for which skills/agents/MCP servers to use per task

---

## GitHub issues to file

Issue inventory grouped by goal. Each gets `type:feature` or `type:chore`, area labels, and `status:needs-plan` (the create-issue skill will plan them later).

### Pre-Goal-2 (schema primitives, `priority:high` blocking)

1. feat: add `trip_kind` enum + `is_template` to `trips` (`area:trips`, `area:rls`)
2. feat: add `is_celebrant` flag to `trip_members` with partial unique index (`area:rls`, `area:trips`)
3. feat: add generic `visibility` enum + apply to existing user-content tables (`area:rls`)
4. feat: decouple `trip_members.user_id` from `auth.users` — accountless attendees (`area:rls`, `area:invites`)
5. feat: add `idempotency_key` to mutation-heavy tables (`area:rls`)
6. feat: add `currency` to money fields (`area:expenses`, `area:rls`)

### Goal 2 (feature additions beyond audit's existing DoD)

7. feat: Fear List intake for celebrant (3 swipe cards → vibe tags) (`area:rsvp`, `area:ui`)
8. feat: Vibe tags as soft constraints + filter (`area:trips`, `area:ui`)
9. feat: Crew Cards / member directory with self-authored bios (`area:trips`, `area:ui`)

### Goal 4

10. feat: Pin Drops table + tap-from-Live-Now (`area:announcements`, `area:realtime`)
11. feat: notification outbox + dispatcher seam (`area:notifications`)

### Goal 5

12. feat: `itinerary_item_kind` + `activity_tag` + `dress_code` fields (`area:itinerary`)
13. feat: lodging assignments table (`area:itinerary`)
14. feat: travel legs / arrivals manifest (`area:itinerary`)
15. feat: per-item RSVP (alongside per-day) (`area:rsvp`, `area:itinerary`)
16. feat: vCard contact export (`area:ui`)
17. feat: "Copy all numbers" button for iMessage flow (`area:ui`)
18. feat: ICS calendar export per attendee (`area:itinerary`)

### Goal 6

19. feat: Lock-In Day full-bleed moment + OG share card via `ImageResponse` (`area:ui`)
20. feat: Drumroll on invite open (`area:invites`, `area:ui`)
21. feat: Hot Seat copy templates file (`area:ui`)
22. chore: microcopy review checklist in PR template (`area:dx`, `area:ui`)

### Goal 6.5

23. feat: itemized money pool entries with per-line opt-in (`area:expenses`)
24. feat: proration of money pool by `trip_member_days` (`area:expenses`)
25. feat: silent sponsorship / comping flow (`area:expenses`)
26. feat: 3-tier nudge escalation (7d/14d/21d) (`area:notifications`, `area:expenses`)
27. feat: audit_log table via Postgres triggers on money + RSVP (`area:rls`, `area:expenses`)

### Goal 7

28. feat: `expense_category` enum + Group Recap stats (`area:expenses`)
29. feat: Quick Tab mode for in-trip expenses (`area:expenses`, `area:mobile`)
30. feat: Settlement closer (lock ledger + single-Venmo-link-per-person) (`area:expenses`, `area:notifications`)
31. feat: Disposable Cam — photos with `developed_at` 24h post-trip (`area:photos`, `area:ui`)
32. feat: Group Recap stub (post-trip web page) (`area:photos`, `area:ui`)

### Post-MVP, design-now (`status:needs-plan` to capture, don't build yet)

33. chore: `display_name_override` on `trip_members` (`area:trips`)
34. chore: `deleted_at` + `archived_at` on `trips` (`area:trips`, `area:rls`)
35. research: AI itinerary extraction feasibility spike (`type:research`, `area:itinerary`)
36. research: Wallet passes (Apple + Google) feasibility (`type:research`, `area:ui`)

### Goal 8

37. feat: `bachelor` + `generic` template configs at `/lib/templates/` (`area:ui`)
38. feat: Time Capsule 1-year anniversary push (`area:notifications`)
39. feat: Recap Card per attendee (`area:photos`, `area:ui`)
40. feat: Live Now during-trip home screen mode (`area:ui`, `area:realtime`)

### Cross-cutting / decisions / docs

41. docs: write 15 new ADRs in `decisions.md` (one PR) (`type:docs`)
42. docs: update CLAUDE.md with new conventions (`type:docs`)
43. docs: regenerate ROADMAP.md as public index (`type:docs`)
44. chore: authenticate Supabase MCP + Vercel MCP (`type:chore`, `area:dx`)
45. chore: disable voltagent/figma/shopify/feature-dev/claude-md-management plugins (`type:chore`, `area:dx`)

**Total: ~45 new issues.** Many are tiny (single-line schema changes); a handful are sub-goals.

---

## What this means for the road ahead

- Pre-Goal-2 schema work = roughly **half a day** if batched into one migration PR. Unlocks everything else.
- The MVP roadmap (Goals 2 → 6) is mostly *additive* — most additions are columns/enums/tags/copy. The big new builds are Disposable Cam (Goal 7), Group Recap stub (Goal 7), and Lock-In Day (Goal 6).
- Most "delight" mechanics ride along existing schema — they're UI choices, not new data models.
- Integration debt is *lower than expected* — most services either don't have APIs or have hostile free tiers, so we link-out. That's a feature for our scope.
- Goal 8 is where the *retention engine* (Time Capsule + Recap Card) is the actual product. MVP earns the right to ship Goal 8.

**The "ambitious without being too ambitious" line:** ship Goals 1.5 → 6 for the real bach trip, then make ONE call after the trip — does Goal 6.5 (money pool) or Goal 7 (expenses + photos + Disposable Cam) ship first based on what the trip actually needed.
