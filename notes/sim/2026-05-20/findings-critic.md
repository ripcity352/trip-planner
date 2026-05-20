# Findings — technical critic

> Pressure-test of the M4 future-state guide against current schema, RLS, and ADRs.
> Standing reality: migrations through `20260520052357_m3_itinerary_announcements.sql`.

---

## Pre-load (filed before persona findings arrive)

### Finding: invites.token SELECT RLS today is `is_trip_member`, not organizer-only
- **Origin:** cross-cutting (mine)
- **Today's reality:** `supabase/migrations/0001_init.sql:191-194` —
  `create policy "members can see invites for their trips" on public.invites for select using (public.is_trip_member(trip_id));`
  Plus `decisions.md:94-98` (M3 closure) explicitly notes: *"`invites.token` SELECT RLS is `is_trip_member`, not organizer-only. The page-level `is_trip_organizer` check in `app/(authed)/trips/[tripId]/invites/page.tsx` is the load-bearing gate."*
- **Guide says:** Section 3, line 128 — *"SELECT RLS on `invites.token` tightens from `is_trip_member` to `is_trip_organizer` (#155). M3 shipped a page-level gate as load-bearing; M4 makes the DB enforce it."*
- **Gap type:** RLS
- **Severity:** ship-blocker for real trip (without it, any joined attendee can SELECT the token and forge an out-of-channel invite link)
- **Where it lands:** roadmap.md M4 (#155 — already there)
- **Verdict:** confirmed. The guide promise matches the DoD. Watch for: tightening this policy will break `accept_invite()` *only if* it relied on SELECT (it doesn't — it's SECURITY DEFINER, so it bypasses RLS). `invite_preview()` is also SECURITY DEFINER. So #155 should land cleanly without touching the two SECURITY DEFINER readers. The page-level gate at `app/(authed)/trips/[tripId]/invites/page.tsx` becomes belt-and-suspenders.

### Finding: invites table has no idempotency_key column today
- **Origin:** cross-cutting (mine)
- **Today's reality:** `0001_init.sql:90-99` creates `invites (token, trip_id, created_by, expires_at, uses_left, created_at)` — no `idempotency_key`. `decisions.md:39-44` confirms the per-table idempotency ADR; existing org-acting tables (`announcements`, `itinerary_items`, `lodging_assignments`) have it; `invites` was missed.
- **Guide says:** Section 3, line 127 — *"`createInviteAction` accepts `idempotency_key` (#158). A drunk best man double-tapping 'Mint a link' on bad cell signal no longer creates two rows."*
- **Gap type:** schema (column add) + idempotency
- **Severity:** ship-blocker for real trip — drunk-double-tap is literally the stated threat model (`decisions.md:163`).
- **Where it lands:** roadmap.md M4 (#158 — already there). M4 migration must add: `alter table public.invites add column idempotency_key uuid; create unique index invites_idempotency on public.invites (trip_id, idempotency_key) where idempotency_key is not null;` per `database-workflow.md:279-281`.
- **Verdict:** confirmed.

### Finding: address_place_id + address_provider columns aren't enumerated in the M4 DoD
- **Origin:** cross-cutting (mine)
- **Today's reality:** `20260520052357_m3_itinerary_announcements.sql:73` — *"NOTE: address, visibility already exist from m1_foundation."* No `address_place_id` or `address_provider` columns.
- **Guide says:** Section 3, line 99 — *"Schema migration in M4: `add column address_place_id text, add column address_provider text` (#166 body)."* But `roadmap.md:185` lists `#166` without explicitly noting the columns. Rule discipline (`database-workflow.md:75-84`) requires one migration per logical change.
- **Gap type:** schema (under-specified DoD)
- **Severity:** nice-to-have (PR will catch it, but DoD should be explicit)
- **Where it lands:** roadmap.md M4 — append *"M4 migration: `address_place_id text`, `address_provider text` on `itinerary_items` (#166)"*
- **Verdict:** confirmed.

### Finding: airline_iata + flight_number columns aren't in M3 schema; #168 migration not in DoD
- **Origin:** cross-cutting (mine)
- **Today's reality:** `20260520052357_m3_itinerary_announcements.sql:155-167` creates `travel_legs (id, trip_id, trip_member_id, kind, depart_at, arrive_at, carrier, confirmation_code, notes, idempotency_key, created_at)`. No `airline_iata` or `flight_number`.
- **Guide says:** Section 3, line 118 — *"Schema migration in M4: `add column airline_iata char(2), add column flight_number text` (#168 body)."*
- **Gap type:** schema
- **Severity:** nice-to-have
- **Where it lands:** roadmap.md M4 — append migration entry. Same M4 migration can bundle #166 + #168 columns + #158 invites.idempotency_key + #155 invites SELECT policy + #154 invites UPDATE policy + #108 trips.timezone — six column/policy changes, all carry-back, one migration file is fine because they share a theme ("M4 carry-back hardening").
- **Verdict:** confirmed.

### Finding: `kind = 'flight'` is not a valid itinerary_item_kind — flight is a travel_leg, not an itinerary item
- **Origin:** cross-cutting (mine)
- **Today's reality:** `20260520052357_m3_itinerary_announcements.sql:42-48` —
  `itinerary_item_kind` enum is `'event' | 'lodging' | 'transport' | 'meal' | 'activity'`. NO `'flight'`. Flights live in `travel_legs` (lines 155-167); `travel_leg_kind` enum (line 53) does include `'flight'`.
- **Guide says:** Section 3, line 116 — *"For `kind = 'flight'`: airline picker"* and line 117 — *"For `kind in ('train', 'drive', 'other')`: freeform `carrier text`"*. The mental model is wrong.
- **Gap type:** schema confusion in spec
- **Severity:** ship-blocker for the picker as drawn (would target the wrong composer)
- **Where it lands:** future-state-guide.md correction. The airline picker lives on the **travel_legs** composer (member-owned), not the itinerary composer. Persona line 203 — *"Hugo lands Fri 4pm local. Adds a travel leg: `kind=flight`, airline picker"* — is correctly travel-leg-scoped; section 3 #6's framing as "organizer-only when they're entering their own travel leg" (line 115) muddles this. RLS: `travel_legs.owner-insert` at migration lines 387-397.
- **Verdict:** confirmed. The composer is owner-write, not organizer-on-behalf.

### Finding: itinerary_item_member_flags blocks self-read — chip picker UI cannot show user own selections
- **Origin:** cross-cutting (mine); foreshadows edge-attendee finding
- **Today's reality:** `20260520052357_m3_itinerary_announcements.sql:502-512` — *"item flags: organizers read"* is the ONLY SELECT policy. A member SELECT of their own row returns zero. The owner-insert and owner-delete policies (lines 514-537) don't grant SELECT.
- **Guide says:** Section 4, line 184 — *"Marcus also cannot see his own flags after submitting them"* and flags this as an open question (line 185, open question 15).
- **Gap type:** RLS + UX
- **Severity:** ship-blocker for the #165 chip picker UX as drawn — a user clicks `shellfish allergy`, navigates away, returns, sees an empty picker. They click again, partial unique `(item_id, trip_member_id, flag)` (migration line 212) blocks the duplicate, server action errors or silently no-ops.
- **Where it lands:** roadmap.md M4 — **add a second SELECT policy** *"item flags: owner reads own"* (`using (trip_member_id in (select tm.id from public.trip_members tm where tm.user_id = auth.uid()))`). One policy add, zero UX work. Alternative — server action returns row on write and UI holds local state — is doable but fragile across browser refresh / tab-switch / new-device.
- **Verdict:** upgraded. The guide marks this `[UNSPECIFIED]`; this finding upgrades it to a *required* M4 decision. Without resolution, the structured-input #165 chip picker is dead-on-arrival.

### Finding: dress_code chip picker is consistent with rule #8 and existing schema — no migration needed
- **Origin:** cross-cutting (mine)
- **Today's reality:** `20260520052357_m3_itinerary_announcements.sql:88-92` — `itinerary_items.dress_code text` exists.
- **Guide says:** Section 3 #1, line 75 — *"no migration needed — the column already exists."*
- **Verdict:** confirmed. Open question 8 (Custom-prefix storage): recommend storing the **raw user text without `"Custom: "` prefix**. The chip UI can derive "this isn't a preset" by string-match against the preset list; storage stays clean.

### Finding: activity_tag is already text[] — chip picker maps cleanly, no migration
- **Origin:** cross-cutting (mine)
- **Today's reality:** `m3 migration:82-86` — `activity_tag text[] not null default '{}'`.
- **Guide says:** Section 3 #2, line 85 — confirmed.
- **Verdict:** confirmed.

### Finding: datetime-local widget on existing day/start_time columns — pure UI work, no schema
- **Origin:** cross-cutting (mine)
- **Today's reality:** `0001_init.sql` has `day date`, `start_time time`, `end_time time`.
- **Guide says:** Section 3 #5, line 111 — confirmed.
- **Verdict:** confirmed.

### Finding: revoke path (#154) — column-scoped UPDATE policy is the right pick (vs SECURITY DEFINER RPC)
- **Origin:** cross-cutting (mine)
- **Today's reality:** `0001_init.sql:201-204` — `invites` has SELECT/INSERT/DELETE only, no UPDATE. M3 closure (`decisions.md:85-92`) documents the workaround.
- **Guide says:** Open question 12 — RPC vs UPDATE policy.
- **Gap type:** RLS path choice
- **Severity:** nice-to-have
- **Where it lands:** decisions.md — pick **column-scoped UPDATE policy** (`using/with check (public.is_trip_organizer(trip_id))`). Rationale: SECURITY DEFINER is the right tool when RLS *can't* express the constraint (atomic accept_invite needs row lock + uses_left decrement + insert in one transaction). Revoke is just an UPDATE the organizer is allowed to do — RLS can say that directly. Less surface, easier audit, two-line migration. RPC is over-engineering.
- **Verdict:** confirmed.

### Finding: Google Places key visibility — server-proxy is correct
- **Origin:** cross-cutting (mine)
- **Today's reality:** No external API integration exists pre-M4.
- **Guide says:** Open question 10 — browser-visible vs server-proxy.
- **Gap type:** rate-limit + security
- **Severity:** ship-blocker for #166 in any form
- **Where it lands:** decisions.md + new route handler at `app/api/places/autocomplete/route.ts`. Rationale: (1) Places billing is real, abusable, and HTTP-referrer restriction is spoofable; (2) `lib/rate-limit/` exists — server proxy lets us add a `PLACES_AUTOCOMPLETE` scope; (3) friction-vs-security memory note applies to user-flow threats, not infra-cost threats. Proxy is +1 file and consistent with #141.
- **Verdict:** confirmed.

### Finding: airline list as constant — picker should be type-ahead autocomplete, not dropdown
- **Origin:** cross-cutting (mine)
- **Today's reality:** No airline table; guide ships `lib/data/airlines.ts` constant.
- **Guide says:** Open question 13 — picker shape.
- **Verdict:** confirmed. 50 items in a dropdown is thumb-hostile on mobile (375px); type-ahead autocomplete (`<Combobox>` shadcn) treats the constant as corpus. Grid is unusable — agree with guide's existing dismissal.

### Finding: blur-gradient pattern conflicts with M3 RLS shape — out of scope for M4
- **Origin:** cross-cutting (mine); will pressure-test celebrant
- **Today's reality:** `m1 migration:171-188` — `can_see_content()` returns boolean; the SELECT RLS policy (`m3 migration:233-237`) **filters rows out entirely**. The celebrant's SELECT returns zero rows for `hide_from_celebrant` items.
- **Guide says:** Open question 2 — two sources point opposite. Persona-groom says "just gone"; ux-design-principles says "blur."
- **Gap type:** scope-creep risk (blur requires a separate masked-SELECT path)
- **Severity:** out-of-scope for M4
- **Where it lands:** **resolve in favor of persona-groom.md** (full-filter). Rationale: (1) it's the existing schema shape; (2) `decisions.md:39-44` settled can_see_content() as the visibility primitive; (3) masked-slot is a new query shape, not a UI tweak; (4) `roadmap.md:194` is firm about stopping at ship. Blur can earn back in M5 if retro shows celebrants felt the absence (unlikely per `persona-groom.md:41`).
- **Verdict:** confirmed as out-of-scope; flag for celebrant if they raise it.

### Finding: trip-local TZ (#108) — `trips.timezone` column is the right pick
- **Origin:** cross-cutting (mine)
- **Today's reality:** no `trips.timezone` column anywhere. `decisions.md:52-56` defers.
- **Guide says:** Open question 1 — quickest (UTC mid-day anchor) vs right (column + date-fns-tz).
- **Severity:** nice-to-have
- **Where it lands:** roadmap.md M4 — **pick `trips.timezone text not null default 'America/Los_Angeles'`**. Two-line migration. Quickest path encodes a bug into the data model; every future TZ-dependent feature (Group Recap, expense dates, photo EXIF) gets harder. Right path is one column + one import (`date-fns-tz`, transitive of existing date-fns).
- **Verdict:** confirmed.

### Finding: rate-limit ratchet (#141) — `MINT_INVITE` is missing from the budget list
- **Origin:** cross-cutting (mine)
- **Today's reality:** `decisions.md:78-82` — `MINT_INVITE` split from `ACCEPT_INVITE` in M3 close. Default budget `30/60s` for both; ratchet review (#141) post-M3.
- **Guide says:** Section 3, line 154 — lists `AUTH_MAGIC_LINK 5/hr, ACCEPT_INVITE 10/hr, CREATE_TRIP 10/hr, SET_RSVP 30/60s, CAST_DATE_VOTE 30/60s` — **omits `MINT_INVITE`**.
- **Gap type:** rate-limit
- **Severity:** nice-to-have
- **Where it lands:** future-state-guide.md fix + roadmap.md M4 #141 — append `MINT_INVITE 10/hour` (org-acting, low-frequency, mirrors `ACCEPT_INVITE`).
- **Verdict:** confirmed.

### Finding: rate-limit fail-closed list (#139) — `MINT_INVITE` should be fail-CLOSED
- **Origin:** cross-cutting (mine)
- **Today's reality:** `decisions.md:218, 228` — in-memory shim retained as regression alarm; timeout-allow promoted to deny.
- **Guide says:** Section 3, line 155 — fail-CLOSED: `AUTH_MAGIC_LINK`, `ACCEPT_INVITE`. Allow-with-warning: `SET_RSVP`, `CAST_DATE_VOTE`, `CREATE_TRIP`. **Omits `MINT_INVITE`.**
- **Gap type:** rate-limit
- **Severity:** ship-blocker — if `MINT_INVITE` falls in allow-with-warning during a shim window, a hostile actor (or a stuck retry loop) can mint unbounded links.
- **Where it lands:** roadmap.md M4 #139 — `MINT_INVITE` is fail-CLOSED (mirrors `ACCEPT_INVITE`). Both are invite-flow abuse vectors.
- **Verdict:** confirmed.

### Finding: created_by binding on itinerary_items is defense-in-depth — M4 UI must not regress it
- **Origin:** cross-cutting (mine)
- **Today's reality:** `m3 migration:241-248` — *"itinerary: organizers insert"* policy includes `auth.uid() = created_by`. The structured-input UI rewrites the same composer.
- **Guide says:** silent.
- **Severity:** watch-out
- **Where it lands:** the M4 PR for #163/#164/#165/#166/#167 must keep `created_by = auth.uid()` set on insert. Recommend adding a regression test in the wave plan.
- **Verdict:** new finding; flag for organizer if any "edit-on-behalf" UX shows up.

### Finding: lodging-assign defense-in-depth (member.trip_id = item.trip_id) preserved
- **Origin:** cross-cutting (mine)
- **Today's reality:** `m3 migration:319-338` — INSERT/UPDATE policies on `lodging_assignments` JOIN through `trip_members` to enforce `tm.trip_id = ii.trip_id`. Plus the trigger `assert_lodging_item_kind_before_assignment` (lines 557-582).
- **Guide says:** Section 3, line 135 — *"Lodging-assign dropdown lists members."* Silent on the cross-trip guard, but the M4 UI does not change this.
- **Verdict:** confirmed (no M4 work). Flag if any organizer narrative implies multi-trip lodging assignment.

### Finding: trip_members_idempotency_key constraint already covers re-invited-attendee replay
- **Origin:** cross-cutting (mine)
- **Today's reality:** `m2_trips_and_invites.sql:58-66` — `trip_members.idempotency_key` partial unique on `(trip_id, idempotency_key)`. Plus `accept_invite()` (lines 75-150) is row-locked + idempotency-checked SECURITY DEFINER.
- **Guide says:** Section 2, line 14 + Section 4, line 174 — accept-invite path.
- **Verdict:** confirmed. Drunk-double-tap on accept is closed at the DB. Drunk-double-tap on mint is open (see invites.idempotency_key finding above).

---

## Cross-cutting summary (final pass — see end of file)

(To be appended after all three persona findings idle.)

---

## Persona findings — critique (rolling)

### Re: organizer batch 1 (Dave)

#### O1 — "Composer dashboard does not exist"
- **Persona's severity:** ship-blocker for real trip
- **Critic verdict:** downgraded
- **Reasoning:** `roadmap.md:163-200` M4 DoD does NOT include an organizer dashboard. `killed-and-deferred.md:42-45` hard-bans completion scores and progress bars *because the trip is not a project with a done state*. An aggregated "outstanding RSVP / next-7-days / items-with-flags" route reframes the trip as a project. M3 already ships now/next card + roster page + invites page — those cover real read needs. **Push to M5 retro.** This is the scope-creep trap the lead asked me to watch for.

#### O2 — "hide_from_celebrant render — slot blur vs full filter"
- **Persona's severity:** ship-blocker for real trip
- **Critic verdict:** downgraded (but the underlying conflict is real)
- **Reasoning:** Two sources disagree; resolution is full-filter (persona-groom.md:41 + M3 RLS shape: `can_see_content()` is boolean, not a sanitizer). Blur requires a NEW masked-SELECT query shape — that's an M5 spike. Decisions.md should record the full-filter pick for M4; the blur fight earns back via M5 if a real-trip retro surfaces "the celebrant felt the absence" (unlikely).

#### O3 — "Trip-local TZ — pick `trips.timezone` + date-fns-tz path"
- **Persona's severity:** ship-blocker for real trip
- **Critic verdict:** confirmed
- **Reasoning:** Matches my pre-load. #167 `datetime-local` granularity makes the "quickest" UTC mid-day anchor demonstrably wrong (anchors at noon UTC erase real start times). Two-line migration on the M4 carry-back: `alter table public.trips add column timezone text not null default 'America/Los_Angeles';` plus `date-fns-tz` imports at the render sites.

#### O4 — "Organizer-write-on-behalf for member-flags"
- **Persona's severity:** nice-to-have
- **Critic verdict:** rejected for M4 (severity is already correct as nice-to-have, but the *direction* is wrong)
- **Reasoning:** M3 migration line 514-525 owner-only INSERT is **load-bearing** for `CLAUDE.md` rule #11 (roles add micro-affordances, not gates) AND for `persona-edge-attendees.md:11-18` (non-default attendees opt INTO participation, not OUT of assumptions). Letting organizers write member-flags on others' behalf inverts both. The "text Marcus to open app" friction Dave named IS the feature, not the bug. Push hard to M5 — and only land it (if ever) with an audit column AND a "Marcus consented offline" disclaimer in the UI. Scope-creep.

#### O5 — "Member self-read of own flags"
- **Persona's severity:** nice-to-have
- **Critic verdict:** upgraded to ship-blocker
- **Reasoning:** The #165 chip picker is dead-on-arrival without self-read. User picks chip, saves, returns, sees blank picker, picks again, hits the partial-unique `(item_id, trip_member_id, flag)` (migration line 212) and either errors or silently no-ops. One-line SELECT policy add fixes it: `using (trip_member_id in (select id from trip_members where user_id = auth.uid()))`. Stack on the M4 carry-back migration alongside #158 / #155 / #154 / #108.

#### O6 — "`Athleisure` chip voice fail"
- **Persona's severity:** nice-to-have
- **Critic verdict:** confirmed; expand
- **Reasoning:** Also `Cocktail` (drink/dress chip ambiguous on a dress-code picker) and `spa` (off-vibe for bach activity-tag). Three string rewrites total; ship-blocker for the microcopy PR-template gate (`roadmap.md:172`) which is a *hard gate*, but the rewrites are 10 minutes of work.


### Re: organizer batches 2-3 (Dave)

#### O7 — "`Cocktail` chip ambiguous on rendered item card"
- **Persona's severity:** nice-to-have
- **Critic verdict:** confirmed
- **Reasoning:** Add "Dress code:" label on the item card (one-line item-card template change), OR rewrite the chip to "Cocktail attire". Either is fine. Nice-to-have.

#### O8 — "Custom-chip storage prefix decision"
- **Persona's severity:** nice-to-have
- **Critic verdict:** confirmed
- **Reasoning:** Store raw text without `"Custom:"` prefix; chip-render UI derives "not in preset list" by string-match against the preset constant. Cleaner storage, identical UX.

#### O9 — "Cliff-date-aware automated nudges"
- **Persona's severity:** nice-to-have
- **Critic verdict:** confirmed as M5+
- **Reasoning:** Notification outbox + dispatcher seam (#33) explicitly killed per `killed-and-deferred.md:31`. Without a second channel, this is patternization without a product. Push to M5 with the second-channel decision.

#### O10 — "MINT_INVITE rate-limit scope unnamed"
- **Persona's severity:** nice-to-have
- **Critic verdict:** confirmed
- **Reasoning:** Matches my pre-load. Add to #141 ratchet table at 10/hour (mirrors `ACCEPT_INVITE` — both are infrequent invite-flow scopes). Persona suggested 20; 10 is more defensible for a posture-ratchet milestone.

#### O11 — "Lodging needs a roster view"
- **Persona's severity:** nice-to-have
- **Critic verdict:** rejected for M4 (scope creep)
- **Reasoning:** Folds into the rejected organizer-dashboard finding (O1). Workaround: 4 taps to open each lodging item for a bachelor trip. M5+ at most.

#### O12 — "Engaged opt-out vs ghost — principle-cost of rule #8"
- **Persona's severity:** out-of-scope
- **Critic verdict:** confirmed; drop
- **Reasoning:** Rule #8 produces this cost honestly. Tracking it adds noise without a corresponding action. Not a bug — a *named trade-off* if any.

#### O13 — "Did Brad engage? — empty=unknown"
- **Persona's severity:** out-of-scope
- **Critic verdict:** confirmed; drop
- **Reasoning:** An engagement-tracking column would tilt the app toward "user as project" framing — adjacent to the hard-banned completion-score pattern (`killed-and-deferred.md:42-45`). Drop.

#### O14 — "Money-pool absence felt at club"
- **Persona's severity:** out-of-scope
- **Critic verdict:** confirmed; drop
- **Reasoning:** M5 deferral is correct per `killed-and-deferred.md:65`. The phantom-double-tap *confirms* the deferral was correctly identified.

#### O15 — "Sunday recap surface — no pull-back"
- **Persona's severity:** out-of-scope
- **Critic verdict:** confirmed; drop
- **Reasoning:** Group Recap settled M5.

#### O16 — "`Front` badge / money-front visibility"
- **Persona's severity:** out-of-scope
- **Critic verdict:** confirmed; drop
- **Reasoning:** Settled in killed-and-deferred (rescoped organizer-private and M5).

#### O17 — "Places provider lock + API-key visibility"
- **Persona's severity:** nice-to-have
- **Critic verdict:** confirmed
- **Reasoning:** Matches my pre-load. Server-proxy at `app/api/places/autocomplete/route.ts` with `PLACES_AUTOCOMPLETE` rate-limit scope. Browser-visible key is scrape-able even with HTTP-referrer restriction.

#### O18 — "Trip-notes multi-tab revalidation (positive)"
- **Persona's severity:** out-of-scope
- **Critic verdict:** confirmed; drop
- **Reasoning:** M3 carry-back working as designed (#159). No M4 work.

**Organizer-net:** confirmed 14 / downgraded 1 / upgraded 1 / rejected 2 (O1 dashboard + O11 lodging roster — both scope creep) / dropped-as-correctly-deferred 0 (already counted under confirmed).

### Re: celebrant batch 1 (David)

#### C1 — "Hide-from-celebrant works as RLS-filter, not blur-gradient"
- **Persona's severity:** nice-to-have
- **Critic verdict:** confirmed
- **Reasoning:** Pick full-filter for M4. The blur path requires a new masked-SELECT shape because `can_see_content()` is boolean. Decisions.md entry locks this. Couples with the addendum (decoy-item pattern). Closes open question 2 from the guide.

#### C2 — "No 'preview-as-celebrant' mode for organizer"
- **Persona's severity:** nice-to-have
- **Critic verdict:** confirmed; push to M5+
- **Reasoning:** Implementing requires altering `is_trip_celebrant()` (a SECURITY DEFINER function) to take an override, or routing through a new `?as_celebrant=true` query path with corresponding tests. Non-trivial; not in M4 DoD.

#### C3 — "`Athleisure` chip reads corporate at celebrant read surface"
- **Persona's severity:** nice-to-have
- **Critic verdict:** confirmed
- **Reasoning:** Stacks with O7 (Cocktail label fix) and `spa` activity-tag chip rewrite. Three-string microcopy PR.

#### C4 — "No first-login intake → defaults are organizer-set"
- **Persona's severity:** out-of-scope (for M4)
- **Critic verdict:** confirmed
- **Reasoning:** `persona-groom.md:63` calls for the 3-question intake; M4 DoD silent. M5+ retro item. The `vibe_tags text[]` column is in place since M1 (`m1 migration:56-60`) — intentionally deferred for filter/UI.

#### C5 — "Vibe-tags don't appear on M4 trip surface"
- **Persona's severity:** out-of-scope
- **Critic verdict:** confirmed
- **Reasoning:** Same as C4. Column-lands-now / UI-later is intentional.

#### C6 — "No per-day RSVP grid on celebrant dashboard"
- **Persona's severity:** nice-to-have
- **Critic verdict:** confirmed (M5+)
- **Reasoning:** `trip_member_days` is solid since M1. The grid surface is M5.

#### C7 — "Empty now/next reads dead"
- **Persona's severity:** out-of-scope
- **Critic verdict:** confirmed; drop
- **Reasoning:** Empty space is the design.

#### C8 — "Celebrant has no audit-assurance organizer-only flags were acted on"
- **Persona's severity:** nice-to-have
- **Critic verdict:** confirmed (M5+) with REJECTION-RISK
- **Reasoning:** Any aggregate signal ("3 flags considered") risks the count-as-teaser pattern explicitly rejected by `persona-groom.md:41`. Default: drop. Earn back via retro only.

#### C-addendum — "Decoy-item pattern fills the time-gap"
- **Persona's severity:** nice-to-have
- **Critic verdict:** confirmed and elevated
- **Reasoning:** This is the *load-bearing* defense against future-Claude re-proposing blur on the basis of "celebrant notices the gap." Decisions.md should record: *"For surprise items, organizer adds a `visibility=everyone` decoy item ('free time' / 'recovery at the Airbnb') in the same slot. Honest, no lie, fills the gap. RLS-filter wins; blur is M5+ if a retro surfaces the absence."*

**Celebrant-net:** confirmed 9 / 0 ship-blocker (correctly) / 0 rejected. Healthy.

### Re: edge-attendee batch 1 (Marcus)

#### E1 — "Member cannot read back own flags after writing"
- **Persona's severity:** ship-blocker for real trip
- **Critic verdict:** confirmed
- **Reasoning:** This is the *strongest cross-persona signal* of the sim. My pre-load, Dave's O5, and Marcus's E1 all converge on the same gap. One SELECT policy add in the M4 carry-back migration closes it. Without it, the #165 chip picker is dead-on-arrival.

#### E2 — "No app-side confirmation flag was delivered to organizer"
- **Persona's severity:** nice-to-have
- **Critic verdict:** confirmed (M5+) with rejection-of-per-flag-receipt
- **Reasoning:** Aggregate "X flags need review" badge is conceivable; per-flag receipts cross the labeling-the-edge-attendee line. Hold that distinction explicitly.

#### E3 — "`skipping this one` flag-chip duplicates per-item RSVP `skipping`"
- **Persona's severity:** nice-to-have
- **Critic verdict:** confirmed; M4
- **Reasoning:** One-line edit to `lib/data/member-flags.ts` to drop the duplicate chip. Closes guide open question 9. Decisions.md entry: *"per-item RSVP is the skipping surface; member-flag chips are non-RSVP signals."*

#### E4 — "No way to opt out of items not yet on itinerary"
- **Persona's severity:** out-of-scope
- **Critic verdict:** confirmed; drop
- **Reasoning:** Phantom-item primitive duplicates existing add-item + RSVP flow.

#### E5 — "No 'heading back' silent ping during event"
- **Persona's severity:** nice-to-have
- **Critic verdict:** confirmed (M5+)
- **Reasoning:** Rides on the killed notification-outbox seam (`killed-and-deferred.md:26-31`). Wait for retro.

**Edge-attendee-net:** confirmed 5 / 1 ship-blocker (E1) / 0 rejected. Tightly scoped findings.

---

## Cross-cutting summary

### Top 3 schema/RLS gaps

1. **`itinerary_item_member_flags` lacks an owner-self-read SELECT policy** (`m3 migration:502-512`). Three-way agreement (pre-load, O5, E1) that this is *the* highest-leverage M4 add. One additive SELECT policy: `using (trip_member_id in (select id from public.trip_members where user_id = auth.uid()))`. Without it, the #165 chip picker is dead-on-arrival — partial-unique `(item_id, trip_member_id, flag)` will collide on the second pick. **Severity: ship-blocker.** **Where: roadmap.md M4, M4 carry-back migration.**

2. **`invites` table missing `idempotency_key` column** (`0001_init.sql:90-99`). Promised by #158 in the guide; not in any current migration. Drunk-double-tap on "Mint a link" is the project's literal stated threat model (`decisions.md:163`). Two-line addition: `alter table public.invites add column idempotency_key uuid;` + `create unique index invites_idempotency on public.invites (trip_id, idempotency_key) where idempotency_key is not null;`. Per-table ADR (`database-workflow.md:279-281`) puts it in the org-acting bucket `(trip_id, idempotency_key)`. **Severity: ship-blocker.** **Where: roadmap.md M4, M4 carry-back migration.**

3. **Invites SELECT RLS (`0001_init.sql:191-194`) currently `is_trip_member`, with the organizer-only gate enforced only at the page level**. `decisions.md:94-98` flags this as a known M4 follow-up (#155). Tightening to `is_trip_organizer` is safe because both `accept_invite` and `invite_preview` are SECURITY DEFINER (RLS-bypass). **Severity: ship-blocker.** **Where: roadmap.md M4 #155 — already there.**

Bundle all three into ONE M4 carry-back migration alongside:
- `address_place_id text` + `address_provider text` on `itinerary_items` (#166 columns)
- `airline_iata char(2)` + `flight_number text` on `travel_legs` (#168 columns)
- `trips.timezone text not null default '<chosen TZ>'` (#108 right-path)
- Column-scoped UPDATE policy on `invites.expires_at` for organizers (#154 — preferred over RPC)
- Additive SELECT policy on `itinerary_item_member_flags` for owner-self-read (gap #1 above)

Six column-adds + 3 RLS policy adds, one migration file. Theme: "M4 carry-back hardening."

### Verdict on the 21 open questions (guide section 6)

| # | Open question | Critic resolution | Lands where |
|---|---|---|---|
| 1 | #108 TZ quickest vs right | `trips.timezone` column + `date-fns-tz` (right path) | M4 carry-back migration |
| 2 | Blur-gradient pattern | Full-filter (matches RLS shape); blur is M5+ if retro surfaces it | decisions.md |
| 3 | Athleisure chip voice | Rewrite (e.g., "Golf casual") | Microcopy PR |
| 4 | First-login groom intake | Out of M4; M5+ | roadmap.md M5 |
| 5 | Member directory bios | Out of M4; M5+ (killed #31 caveat applies) | roadmap.md M5 (or drop) |
| 6 | Silent itinerary-item veto | Out of M4; M5+ | roadmap.md M5 |
| 7 | Co-organizer handoff UX | Out of M4; M5+ | roadmap.md M5 |
| 8 | Custom-chip storage prefix | Store raw text without prefix | decisions.md + UI |
| 9 | `skipping this one` duplication | Drop the chip; RSVP is the canonical surface | M4 (one-line) + decisions.md |
| 10 | Google Places API key visibility | Server-proxy via Next.js route + `PLACES_AUTOCOMPLETE` rate-limit scope | decisions.md + #166 |
| 11 | Places provider choice | Google (locked by lead) | decisions.md |
| 12 | #154 revoke RPC vs UPDATE policy | Column-scoped UPDATE policy (less surface, RLS-expressible) | M4 carry-back migration |
| 13 | Airline picker UI shape | Type-ahead autocomplete over `lib/data/airlines.ts` constant | M4 #168 UI |
| 14 | Empty-state + label microcopy | Write keys in `lib/copy/empty-states.ts` per PR-template gate | Microcopy PR |
| 15 | Member self-read of own flags | Additive SELECT policy (one line) | M4 carry-back migration |
| 16 | Member-flag composer heading | Voice-test ("Anything we should know?" passes) | Microcopy PR |
| 17 | Chip-picker a11y to VoiceOver/TalkBack | Test under axe-core; specific announce role per #82 | M4 a11y wave |
| 18 | `Athleisure` / `Cocktail` / `spa` rewrites | Three-string rewrite + "Dress code:" label on item card | Microcopy PR + item-card template |
| 19 | Theming pass scope (#90, #121) | Organizer-configurable per trip; no `trip_kind`-hardcoded path | M4 theming wave |
| 20 | `/legal/*` voice | Cite "Built by friends for friends," personal-data-light disclosure, dinner-test prose | M4 #81 |
| 21 | #83 custom-domain mechanics | Vercel Marketplace; DNS cuts to prod at M4 ship; previews stay on `*.vercel.app` | M4 #83 |

**Open-question-net:** 13 resolved in-M4 / 6 deferred to M5+ / 2 (questions 11, 17) require an external lock (provider, a11y testing).

### Persona tally — critic verdict

| Persona | Filed | Confirmed | Downgraded | Upgraded | Rejected | Dropped-as-correct |
|---|---|---|---|---|---|---|
| Organizer (Dave) | 18 | 14 | 1 (hide-from-celebrant severity) | 1 (member self-read) | 2 (composer dashboard, lodging roster — scope creep) | 0 explicit, 5 confirms were "out-of-scope and that's correct" |
| Celebrant (David) | 8 + 1 addendum | 9 | 0 | 0 | 0 | 1 (empty now/next is design) |
| Edge-attendee (Marcus) | 5 | 5 | 0 | 0 | 0 | 1 (phantom items) |
| **Total** | **32** | **28** | **1** | **1** | **2** | **2** |

### The 2-3 highest-severity cross-cutting findings

1. **Member self-read RLS gap on `itinerary_item_member_flags`** (cross-persona ship-blocker confluence). One additive SELECT policy. **Highest leverage in M4.**
2. **`invites.idempotency_key` column missing** for #158. The drunk-double-tap use case is literally the stated threat model. Two-line schema add.
3. **Five M4 carry-back items belong in a single migration, not five PRs.** #108 + #154 + #155 + #158 + #166 columns + #168 columns + member-flag self-read = nine schema/RLS changes that share a theme. Bundling them as one migration file ("M4 carry-back hardening") is consistent with `database-workflow.md:75-84` because they share the logical theme. Five separate migrations would generate noise.

### Verdict on M4 mandate

The roadmap (`roadmap.md:194`) says **STOP HERE.** The personas' instincts collectively pull in two directions:
- **Organizer (Dave) inflates** — wants a composer dashboard, lodging roster, automated nudges. All M5+.
- **Celebrant (David) holds** — every finding is correctly scoped to M5+ or drop. Zero ship-blockers.
- **Edge-attendee (Marcus) holds** — five tightly-scoped findings, one ship-blocker, four correctly-deferred.

**The bigger risk this sim surfaced is scope creep from the organizer's framing, not under-spec'd surfaces.** The DoD as written is correct; the carry-back migration just needs the three pre-load additions (member self-read, invites.idempotency_key, trips.timezone) and the open questions resolved per the table above.

---

# Re-audit (post-persona walks, post-lead-prompt)

> After all three personas idled, team-lead asked four targeted questions. This section is the re-audit. Where it disagrees with the initial pass above, the re-audit is authoritative.

## Re-audit batch 1: Flag-lifecycle UX cluster (lead Q1)

**Schema soundness check on Marcus's `written_by` proposal:**
- The column must be `written_by_trip_member_id uuid references public.trip_members(id)`, NOT `auth.users(id)`. This matches the M1 FK-retargeting convention (`database-workflow.md:256-271`) and the existing `trip_member_id` column shape on the same table.
- Two additive INSERT policies, not one widened:
  - Keep current `"item flags: owner insert"` (m3 migration:514-525) unchanged
  - Add `"item flags: organizer insert on behalf"` with `with check (public.is_trip_organizer(...) and written_by_trip_member_id in (select id from trip_members where user_id = auth.uid()) and trip_member_id <> written_by_trip_member_id)`. The third clause prevents an organizer from forging member-self attribution.
- The unique constraint `(item_id, trip_member_id, flag)` (line 212) holds unchanged. The confirm/remove UI mutates that single row.

**Severity re-verdicts:**
- edge #1 (self-read): ship-blocker → **confirmed**
- edge #2 (delivery confirmation badge): M5+ → **confirmed** (aggregate-only OK; per-flag receipt rejected for labeling risk)
- edge #10 / org #4 (write-on-behalf): **nice-to-have for M4, M5 retro if no budget** (walks back my initial principle-inversion framing — Marcus's `written_by` + member-confirm proposal closes the principle objection)
- org #5 (member self-read): nice-to-have → **upgraded to ship-blocker**
- celebrant #8 (celebrant audit-assurance): M5+ with rejection-risk → **confirmed**

## Re-audit batch 2: Decoy-item RLS audit + composer dashboard query analysis (lead Q2 + Q3)

**Decoy-item pattern under RLS:**
- Tested against `can_see_content()` (m1 migration:171-188) and itinerary SELECT policy (m3 migration:233-237): celebrant sees only the `everyone` decoy row; organizer sees both. ✓
- No `(trip_id, day, start_time)` uniqueness on `itinerary_items` — two items at the same slot is structurally indistinguishable from real scheduling overlap. **That's the win, not a leak — plausible deniability.**
- `itinerary_item_rsvps` on the decoy: innocuous (celebrant can RSVP `going` to "free time"); no cross-leak to the hidden item.
- `lodging_assignments` cross-trip guard: trigger `assert_lodging_item_kind_before_assignment` (lines 557-582) blocks lodging-assignment to non-lodging items.
- **M5+ guardrail to document in decisions.md:** never ship an activity feed exposing item-creation timestamps to the celebrant — would reveal decoys by adjacency.

**Composer dashboard schema-cost (org #1):**
- Three queries (outstanding-RSVP, next-7-days, items-with-flags) read existing tables with existing RLS and existing indexes. No schema additions needed.
- One observability concern: query (a)'s "outstanding" semantics need pinning (`rsvp_status = 'pending'` is cheap; "joined but no day-RSVP" requires LEFT JOIN against `trip_member_days` — verify `lib/db/trips.ts` materializes this).
- **Re-verdict on org #1 severity:** previously rejected as scope creep; revised to **conditional nice-to-have**. Ship only if held strictly to three flat lists, no badges, no counts in headings, no interactivity. One bad PR away from completion-score territory. If the M4 wave plan can't fit it, push to M5.
- org #11 (lodging roster): folds into dashboard. Don't ship without dashboard.

## Re-audit batch 3: Voice ship-blockers + 21 open questions delta-resolution (lead Q4)

**Edge #8 heading microcopy promoted to ship-blocker:**
- PR-template microcopy gate (`roadmap.md:172`) is a hard gate. Without the heading key, the #165 chip-picker PR can't pass review.
- Adopt Marcus's strings as-is: heading `"Anything we should know?"`, subhead `"Just for the organizer — private to you."` Pass the dinner-test and name the privacy guarantee inline (defense against future-Claude adding a "make this visible" toggle).

**Voice rewrites bundle (one PR):**
- `Athleisure` → rename to **"Golf casual"**. Both read-surface personas (David + Dave) felt it as corporate; Marcus defended keeping it but the read-surface is where chips render verbatim, and that's where the friction lives.
- `Cocktail` → rename to **"Cocktail attire"**. Three-persona agreement on ambiguity (drink vs dress in a dress-code picker context).
- `spa` → **keep**. Only flagged once in the guide; no persona triggered on it.
- Plus the item-card render — always label dress-code chips with `"Dress code: <chip>"` prefix on the item card. One-line template change; belt-and-suspenders for ambiguity.

**21 open questions delta (16 of 21 resolved by persona walks):**

| # | Topic | Resolved by | M4 resolution |
|---|---|---|---|
| 1 | #108 TZ path | org #3 + pre-load | `trips.timezone` column + `date-fns-tz` |
| 2 | Blur vs filter | celebrant + org + addendum | RLS-filter + decoy-item pattern in decisions.md |
| 3 | Athleisure voice | celebrant + edge | Rename to "Golf casual" |
| 4 | First-login groom intake | celebrant | M5+ |
| 5 | Member directory bios | celebrant | M5+ — bare bio column, not Crew Cards |
| 6 | Silent itinerary-item veto | celebrant | M5+ |
| 7 | Co-organizer handoff | celebrant | M5+ |
| 8 | Custom-chip storage prefix | org | No prefix; raw text |
| 9 | Skipping duplication | edge | Drop chip; per-item RSVP is canonical surface |
| 10 | Places API key visibility | org + pre-load | Server-proxy + `PLACES_AUTOCOMPLETE` rate-limit scope |
| 11 | Places provider | locked by lead | Google Places |
| 12 | #154 revoke path | pre-load | Column-scoped UPDATE policy, not RPC |
| 13 | Airline picker shape | pre-load | Type-ahead autocomplete |
| 14 | Empty-state microcopy | edge #8 (partial) | Heading lands; full empty-state strings still TBD per chip |
| 15 | Member self-read of flags | edge + org + pre-load | Additive SELECT policy |
| 16 | Composer heading | edge #8 | "Anything we should know?" |
| 17 | Chip-picker a11y | — | **Open** — needs M4 mobile-QA pass |
| 18 | Athleisure / Cocktail / spa | celebrant + org + edge | Rename Cocktail + Athleisure; keep spa; add "Dress code:" label |
| 19 | Theming pass scope | — | **Open** — defer until M4 theming wave starts |
| 20 | `/legal/*` voice | — | **Open** — defer until #81 PR |
| 21 | Custom-domain mechanics | — | **Open** — operational, resolves in #83 PR |

Net: 16 resolved, 5 remain (17, 19, 20, 21 + partial 14). All 5 are operational/per-PR, none block the spec.

**Edge #5 silent-ping safety-framing re-verdict:**
- Confirmed M5+ but note: the safety case ("sober person leaving a club") is better solved by *text-organizer-directly* (organizer phone is on the M3 roster), not by in-app push. In-app push only fires if the organizer has the app open. Document as **retired ask** in decisions.md with rationale, so M5 retro doesn't re-propose the killed outbox seam under safety-coded framing.

**Celebrant #14 silent-veto re-verdict:**
- Confirmed M5+ hard-no for M4 even if budget exists. Inverting the organizer-write/member-read model is a post-trip-retro decision, not an M4 polish item.

## Re-audit batch 4: Final answers to lead's four questions

**Q1 — Flag lifecycle schema additions sound?** Yes, with two guardrails: `written_by_trip_member_id` references `trip_members(id)` (not auth.users), and the organizer-on-behalf INSERT policy includes `trip_member_id <> written_by_trip_member_id` to prevent forged self-attribution.

**Q2 — Decoy-item leak under RLS?** No leak in M4. Pattern produces plausible deniability via lack of slot-uniqueness. One M5+ guardrail: never ship a recent-changes activity feed exposing item-creation timestamps to celebrant.

**Q3 — Composer dashboard really no schema?** Yes, all three queries hit existing tables/indexes/RLS. **Re-verdict: conditional nice-to-have, not rejected.** Constraints: 3 flat lists, no badges, no counts in headings, no interactivity. If any creep in, defer the whole thing to M5.

**Q4 — 21 open questions:** 16 resolved by persona walks, 5 remain open (chip a11y, theming, legal voice, custom domain, partial chip empty-states). All 5 are operational, not blocking-spec.

## Final M4 ship-blocker tally (post-re-audit)

**6 ship-blockers:**
1. Member self-read RLS policy on `itinerary_item_member_flags`
2. `invites.idempotency_key` column (#158)
3. `invites.token` SELECT RLS tightening (#155)
4. `trips.timezone` column (#108)
5. Member-flag composer heading microcopy
6. `Cocktail` chip rename + "Dress code:" item-card label

**~10 carry-back items in the same migration/decisions log/PR bundle:**
- `#154` column-scoped UPDATE policy
- `#166` columns (`address_place_id`, `address_provider`)
- `#168` columns (`airline_iata`, `flight_number`)
- `MINT_INVITE` rate-limit scope add + fail-closed inclusion
- `Athleisure` → "Golf casual" rename
- Drop `skipping this one` chip from `lib/data/member-flags.ts`
- Decoy-item + RLS-filter ADR in decisions.md
- Places server-proxy route + `PLACES_AUTOCOMPLETE` scope
- Custom-chip storage = raw text without prefix
- Edge #5 retired-ask entry in decisions.md (safety case → text-organizer)
- decoy-pattern M5+ guardrail (no activity feed with item-creation timestamps)

**Single highest-leverage change:** the additive SELECT policy on `itinerary_item_member_flags` for owner-self-read. One line. Three-persona agreement. Unblocks the #165 chip picker entirely.

**Verdict on M4 mandate:** `roadmap.md:194` "STOP HERE" holds. Persona sim surfaced no genuine M4 expansion. The composer-dashboard ask is the boundary case — defensible if constrained, reject if it grows badges.
