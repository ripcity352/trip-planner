# Organizer findings (Dave) — M4 pressure-test sim
> Walked 2026-05-20 by `organizer` teammate (persona-best-man.md).
> Filed via SendMessage (subagent Write blocked by harness rule "subagents return findings as text").
> Team-lead transcribed to file.

### Finding: Composer dashboard does not exist
- **Scene:** T-7 home-screen open; six chip-picker composers ship on item-edit forms but no aggregated "what's outstanding / at risk / next 7 days" surface for the organizer.
- **Persona:** organizer (Dave)
- **Today's reality:** M3 dashboard ships now/next, trip name, RSVP state. M4 changes individual form fields, not the dashboard.
- **Guide says:** future-state-guide §3 lists composer surfaces; no aggregated organizer briefing.
- **Gap type:** UX + spec
- **Severity:** ship-blocker for real trip
- **Where it lands:** roadmap.md M4 — add `/trips/[tripId]/organizer` route with (1) outstanding-RSVP list w/ days-since-invite, (2) next-7-days items, (3) items with member-flag rows. No new schema.

### Finding: hide_from_celebrant render — slot blur vs full filter
- **Scene:** Adding the jersey-reveal item Sat dinner-time `visibility=hide_from_celebrant`; two source docs disagree on celebrant view.
- **Persona:** organizer (Dave) — DM'd celebrant to confirm view
- **Today's reality:** M3 RLS filters the row entirely. Celebrant sees a gap.
- **Guide says:** §6 #2 — `ux-design-principles.md:51–73` describes a frosted-blur "slot exists, content hidden"; `persona-groom.md:41` + M3 RLS say "just gone." Two sources, opposite directions.
- **Gap type:** spec
- **Severity:** ~~ship-blocker for real trip~~ **nice-to-have** (downgraded after celebrant DM cross-check; both walks landed at filter-wins, M3 RLS shape ships unchanged, only decisions.md entry needed)
- **Where it lands:** decisions.md — record "RLS-filter wins" rationale. Pair with the **decoy-item workaround** the celebrant walk surfaced: organizer fills a multi-hour hide_from_celebrant gap with a real `visibility=everyone` item ("free time / regroup at 5:30") so the celebrant doesn't notice a conspicuous time-gap. Honest enough, no lie, fills the slot — works in M3+M4 today, no schema change. The ADR should acknowledge this trade-off explicitly so future-Claude doesn't re-propose the blur on "celebrant notices the gap."

### Finding: Trip-local TZ — pick `trips.timezone` + date-fns-tz path
- **Scene:** Hugo's BA 0285 arrival rendering Fri 4:12pm in Austin TZ on arrivals manifest.
- **Persona:** organizer (Dave)
- **Today's reality:** M3 ships nothing TZ-aware; manifest shows browser TZ.
- **Guide says:** §6 #1 — two paths unresolved. §3 implies the column+formatter path.
- **Gap type:** spec — wrong choice produces correctness bug as soon as `datetime-local` (#167) ships.
- **Severity:** ship-blocker for real trip
- **Where it lands:** decisions.md — lock `trips.timezone` column + `date-fns-tz` path; quickest (mid-day UTC anchor) breaks at datetime granularity.

### Finding: Organizer-write-on-behalf for member-flags
- **Scene:** Chef-lunch venue lock at T-7; Marcus told me in March via text DM about shellfish allergy; M4 has no path to bank it without his tap.
- **Persona:** organizer (Dave)
- **Today's reality:** INSERT policy on `itinerary_item_member_flags` is owner-only (`migrations/20260520052357_m3_itinerary_announcements.sql:514–525`).
- **Guide says:** §3 #3 — "member is the writer."
- **Gap type:** UX workflow (schema/principle hold; write-path too narrow for real organizer cognition).
- **Severity:** nice-to-have (workaround: text Marcus to open app — exactly the asymmetric-labor problem the persona names).
- **Where it lands:** roadmap.md M4 — extend INSERT policy to organizer-on-behalf with audit column (`set_by_trip_member_id`), OR roadmap.md M5+ if M4 is frozen.

### Finding: Member self-read of own flags
- **Scene:** Marcus picks shellfish-allergy chip → save → form goes blank; he texts me "did the allergy thing save?"
- **Persona:** organizer (Dave) — DM'd edge-attendee
- **Today's reality:** SELECT policy organizer-only (`migrations/20260520052357_m3_itinerary_announcements.sql:502–512`). Even self-read blocked.
- **Guide says:** §6 #15 unspecified.
- **Gap type:** UX (and minor RLS gap)
- **Severity:** nice-to-have *(but edge-attendee files this as ship-blocker from member's chair — see findings-edge.md Finding #1; synthesis should defer to the more severe filing)*
- **Where it lands:** roadmap.md M4 — extend SELECT with `or trip_member_id in (select id from trip_members where user_id = auth.uid())` OR have the server action return the inserted row. **Corroborated independently by edge-attendee walk** — same gap, two chairs, one fix.

### Finding: `Athleisure` chip voice fail
- **Scene:** Golf dress-code pick; "Athleisure" is borderline-corporate, not party-coded.
- **Persona:** organizer (Dave)
- **Today's reality:** Listed in #163 chip set.
- **Guide says:** §6 #3 QUESTIONABLE.
- **Gap type:** voice
- **Severity:** nice-to-have
- **Where it lands:** roadmap.md M4 — rewrite to "Golf casual" or "Casual / sporty"; voice test under the dinner-test bar.

### Finding: `Cocktail` chip ambiguous on rendered item card
- **Scene:** Downtown happy-hour card; chip reads as drink (it's happy hour) vs dress (cocktail attire) without a "Dress code:" label.
- **Persona:** organizer (Dave)
- **Today's reality:** Chip rendered verbatim on item card per #163 / §2.
- **Guide says:** §6 #18 flagged.
- **Gap type:** UX
- **Severity:** nice-to-have
- **Where it lands:** roadmap.md M4 — item-card render must include "Dress code: <chip>" label; or rewrite chip to "Cocktail attire."

### Finding: Custom-chip storage prefix decision
- **Scene:** Club item dress code freeform fallback ("no shorts/sneakers, button-up or fit tee").
- **Persona:** organizer (Dave)
- **Today's reality:** §6 #8 unspecified — issue #163 example uses `"Custom: <text>"` prefix; column comment is silent.
- **Gap type:** spec
- **Severity:** nice-to-have
- **Where it lands:** decisions.md — store raw user text without "Custom:" prefix; card-render handles the chip-style affordance from the absence of preset match.

### Finding: Cliff-date-aware automated nudges missing
- **Scene:** I post the Airbnb deposit-cliff announcement manually at T-15 — the persona's "system as shield" ask is unmet.
- **Persona:** organizer (Dave)
- **Today's reality:** No cron, no trigger, no push for cliff dates. Roadmap mentions push policy but no generator.
- **Guide says:** silent on the generator side.
- **Gap type:** spec
- **Severity:** nice-to-have (works manually; persona-best-man.md:21 social-cost rationale is the real argument).
- **Where it lands:** roadmap.md M5+ (needs second notification channel per #33 closure — not M4).

### Finding: MINT_INVITE rate-limit scope unnamed
- **Scene:** Mike + Kevin re-mint on flaky parking-garage WiFi; idempotency catches the double-tap, scope is unclear.
- **Persona:** organizer (Dave)
- **Today's reality:** §3 ratchets `AUTH_MAGIC_LINK`, `ACCEPT_INVITE`, `CREATE_TRIP`, `SET_RSVP`, `CAST_DATE_VOTE` per #141. No `MINT_INVITE` row.
- **Gap type:** spec
- **Severity:** nice-to-have
- **Where it lands:** roadmap.md M4 — add `MINT_INVITE` to per-scope ratchet table (suggested: 20/hour organizer-scoped).

### Finding: Lodging needs a roster view
- **Scene:** Greg asks "who's in which room?" four times; I have to open each lodging item.
- **Persona:** organizer (Dave)
- **Today's reality:** Assignment is per-item dropdown (#160, M3 lodging_assignments table).
- **Gap type:** UX
- **Severity:** nice-to-have (folds into Finding #1's organizer dashboard if shipped).
- **Where it lands:** roadmap.md M4 — read-only roster module under organizer dashboard.

### Finding: Engaged opt-out vs ghost — principle-cost of "don't encode a default"
- **Scene:** Mike no-shows chef lunch silently — no chip picked, RSVP defaulted `going` (per `migrations/20260520052357_m3_itinerary_announcements.sql:60–69`). Marcus also silently opt-outs Sat club (chip picked). Both look identical from defaulted `going` perspective.
- **Persona:** organizer (Dave)
- **Today's reality:** Per-item RSVP default is `going` when day-RSVP is `going`; silent opt-out chip is opt-in.
- **Gap type:** principle-cost (rule #8 produces this cost honestly — not a bug).
- **Severity:** out-of-scope
- **Where it lands:** drop (or decisions.md as named trade-off on rule #8 if audit-round-2 tracks principle costs).

### Finding: "Did Brad engage?" — empty = unknown
- **Scene:** Reading golf-item member-flags; Brad has zero rows. Can't distinguish "Brad has no constraint" from "Brad didn't engage with the app."
- **Persona:** organizer (Dave)
- **Today's reality:** No engagement-tracking column on `itinerary_item_member_flags`.
- **Gap type:** principle-cost
- **Severity:** out-of-scope
- **Where it lands:** drop.

### Finding: Money-pool absence felt at club — settled M5 deferral
- **Scene:** 11pm club; bad cell signal; I double-tap a "settle Mike → me $80" affordance that doesn't exist. Eventually open Venmo. The phantom-double-tap is the test of CLAUDE.md rule #9 idempotency — except the surface doesn't ship.
- **Persona:** organizer (Dave)
- **Today's reality:** Money pool M5 per `killed-and-deferred.md:65`.
- **Gap type:** killed-but-regretted
- **Severity:** out-of-scope (M4 correct to defer)
- **Where it lands:** drop — in-trip moment confirms deferral was correctly identified; not re-litigating.

### Finding: Sunday recap surface — no pull-back
- **Scene:** Sunday breakfast at Airbnb; app goes silent. Nothing to screenshot for David.
- **Persona:** organizer (Dave)
- **Today's reality:** Group Recap M5+ per `killed-and-deferred.md`.
- **Gap type:** killed-but-regretted
- **Severity:** out-of-scope
- **Where it lands:** drop (Group Recap correctly M5; even a minimal aggregate-screenshot is deferred — file as nice-to-have if M4 has 30 minutes for a `/recap` aggregate read off existing M3 tables, otherwise drop).

### Finding: "Front" badge / running tally — money-front visibility
- **Scene:** Walking home Sunday; persona-best-man.md:100 says I want the badge that says I floated $3,047 without me bringing it up.
- **Persona:** organizer (Dave)
- **Today's reality:** Money-Front rescoped organizer-private per `killed-and-deferred.md`; deferred M5.
- **Gap type:** killed-but-regretted
- **Severity:** out-of-scope
- **Where it lands:** drop.

### Finding: Places provider lock + API-key visibility
- **Scene:** First address autocomplete on golf venue triggers the M4 Places dep.
- **Persona:** organizer (Dave)
- **Today's reality:** Google Places locked per team-lead message (resolves §6 #11). §6 #10 — key visibility (`NEXT_PUBLIC_*` vs server-proxy) unresolved.
- **Gap type:** spec (security posture)
- **Severity:** nice-to-have
- **Where it lands:** decisions.md — lock server-proxy path. A browser-visible key is scrape-able; one Next.js route fetches Places on behalf with the server-only key. Aligns with the project-memory friction-vs-security philosophy (low user friction, RLS-style backstop on the server).

### Finding: Trip-notes multi-tab revalidation (positive confirmation)
- **Scene:** I edit trip notes on my laptop; phone dashboard refreshes after `revalidatePath` per #159.
- **Persona:** organizer (Dave)
- **Today's reality:** Works as designed.
- **Gap type:** none — positive M3 carry-back working.
- **Severity:** out-of-scope
- **Where it lands:** drop (capture as "M3 carry-back working" if M4 closure notes do that).

---

### Finding: Organizer "preview as celebrant" toggle (added post-DM cross-check)
- **Scene:** I set `visibility=hide_from_celebrant` on the gag-gift item and want to sanity-check it actually disappears from David's view. I have no incognito magic-link path; I'm trusting RLS abstractly. One wrong visibility enum and the surprise is dead.
- **Persona:** organizer (Dave) — surfaced via celebrant DM cross-check
- **Today's reality:** No "view as celebrant" toggle. Organizer reads the same view they write.
- **Guide says:** silent. `persona-groom.md` doesn't ask for it because the celebrant doesn't need it; it's a writer-side concern.
- **Gap type:** UX
- **Severity:** nice-to-have
- **Where it lands:** roadmap.md M4 (if cheap — server-rendered alt view with celebrant role substituted in `is_trip_organizer()` evaluation) OR roadmap.md M5+ (if it requires a role-impersonation primitive).

---

## Tally (from organizer's wrap-up, updated post-DM cross-checks)

- **Ship-blocker for real trip: 2** (downgraded from 3) — #1 composer dashboard, #3 TZ fix path. #2 hide-from-celebrant render dropped to nice-to-have after both walks confirmed filter-wins (only decisions.md entry needed, no UI work).
- **Nice-to-have: 12**
- **Out-of-scope / killed-but-regretted: 4**
- **Total: 19** (added #19 preview-as-celebrant)

**Highest-leverage to ship this week:** Finding #1 — read-only `/trips/[tripId]/organizer` route aggregating outstanding RSVPs, next 7 days, items with member-flag rows. No new schema. Closes the gap between "the six composers all work" and "I would actually open this app on Tuesday at 11pm."

**Distant second:** decide §6 #2 (hide_from_celebrant render — blur vs full filter) before any M4 celebrant-timeline UI lands.

**DMs sent during walk:**
- → celebrant (David): hide_from_celebrant render question on jersey-reveal slot
- → edge-attendee (Marcus): round-trip confirmation gap on flag-chip submission
