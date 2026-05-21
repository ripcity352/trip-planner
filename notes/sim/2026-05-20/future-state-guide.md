# Future-state guide — Party Trip at end of M4
> Scope: M4 open decisions only. Pressure-test target, not implementation spec.
> Sources cited inline. Anything unsourced is marked [UNSPECIFIED — open question].

## 1. What's settled in this version (one-paragraph orientation)

At end of M4, Party Trip is the same product as M3 — one URL covers itinerary, announcements + realtime, trip notes, arrivals manifest, roster with vCard mass-download, organizer invite minting — wearing its ship clothes. M4 adds **six structured-input surfaces** (dress-code chips, activity-tag chips, member-flag chips, address autocomplete, `datetime-local`, airline+flight-number picker) layered over M3's freeform text columns *without* changing the schema's "no encoded default" stance (`roadmap.md:178–186`, `roadmap.md:199–200`). It hardens the M2/M3 carry-back follow-ups for production traffic — trip-local TZ, invites RLS, idempotency, rate-limit per-scope ratchet, and three prod-walk display fixes (`roadmap.md:188–192`). It puts on the polish a real party invitee will see: custom domain, theming, mobile QA, microcopy enforcement, `/legal/*` stubs, axe-core + Lighthouse a11y, color-is-never-the-only-signal (`roadmap.md:168–177`). Then it stops. The bachelor party uses it. M5 only opens after a real-trip retro (`roadmap.md:14–15`, `roadmap.md:194–195`).

---

## 2. What the celebrant (groom) sees and can do

**Login + first landing**
- Magic link in iMessage/email → tap → lands inside trip dashboard. No PKCE same-device requirement; cross-device clicks work via token-hash (`decisions.md:137–206`).
- First page paint shows the now/next card, RSVP state, trip name + countdown, weekend-at-a-glance (`ux-design-principles.md:103–141`).
- Dates render in the trip's local TZ, not the viewer's browser TZ. A celebrant in HI sees the same "Jun 12" the organizer in PT chose (issue #108).
  - [UNSPECIFIED — open question: M4 fix path. Issue #108 lists two options — quickest = anchor parsing at `T12:00:00Z`; right = `trips.timezone` column + `date-fns-tz` formatter. Roadmap line 188 just says "trip-local TZ (#108)" without picking one. See section 6.]

**Itinerary view**
- Day-by-day vertical timeline at 375px. Items sort by `day` then `start_time` (`migrations/20260520052357_m3_itinerary_announcements.sql:24–36`, `roadmap.md:124–132`).
- Surprise items (organizer-set `visibility = 'hide_from_celebrant'`) are filtered server-side via `can_see_content()` RLS before reaching the client — celebrant never sees a "1 hidden item" teaser (`migrations/20260519123255_m1_foundation.sql:128–172`; `persona-groom.md:41`, `persona-groom.md:71`).
  - [UNSPECIFIED — open question: blur-gradient pattern. `ux-design-principles.md:51–73` describes a frosted-blur where the celebrant *does* see the slot (date/time/category) but the content is blurred — "the slot exists, the content is hidden." RLS as shipped in M3 filters the row entirely. M4 does not appear to change this. See section 6.]
- For non-hidden items: kind icon (lucide SVG, no emoji) (`decisions.md:62–66`, issue #156), title, time, address (taps out to Maps deep link), dress code (now a preset chip value or "Custom: <text>"), activity tags as chips (issue #164).
- Dress-code chip on an item card renders the preset value or freeform fallback verbatim. Presets shown: **Black tie · Smart casual · Cocktail · Beach formal · Loud shirts · Athleisure · Custom** (issue #163 body).
  - Voice test on `Loud shirts`: would you say this at a pre-trip dinner? Yes. PASSES.
  - Voice test on `Athleisure`: borderline. The bach-party audience may read it as corporate. [UNSPECIFIED — open question: does the celebrant ever see this chip? Roadmap line 167–186 is silent on whether celebrant can edit dress code or only view. See section 6.]
- **Field input mode (celebrant view-only on items they don't own):** all read-only.

**Per-item RSVP**
- Default state = `going` for any item on a day the celebrant RSVPd `going` (`roadmap.md:138–141`, `migrations/20260520052357_m3_itinerary_announcements.sql:60–69`).
- One-tap silent opt-out chip per item. Opt-out: no notification, no peer visibility (`roadmap.md:140–141`, `migrations/20260520052357_m3_itinerary_announcements.sql:198–199`).
- **Field input mode:** structured chip (`going` / `skipping`) — no freeform.

**"What does the groom actually want?" / first-login intake**
- [UNSPECIFIED — open question: persona-groom.md:63 calls for a 3-question private intake on first login (vibe-tag seed). Not in M4 DoD. Out of scope for M4? See section 6.]

**Hidden-from-celebrant axis**
- Itinerary items, announcements, polls, expenses, pins, photos all carry the `trip_visibility` enum (`migrations/20260519123255_m1_foundation.sql:128–146`, `CLAUDE.md` rule #7). M4 changes nothing about this; surprise items remain filtered.
- No teaser, no shadow card, no "🔒 1 hidden item" string. Confirmed by RLS shape (filter at SELECT, not blur at client) and persona requirement (`persona-groom.md:41`).

**Dashboard "now / next" card**
- Single answer in <1s glance: next item title, time, location (`roadmap.md:133–135`). With `datetime-local` widget (#167), most non-lodging items now have a real `start_time`; the card transitions correctly from `next` → `right now` → `next` instead of just naming the next item (#167 body).
- **Field input mode (celebrant view-only):** read-only.

**Trip notes (FAQ)**
- Organizer-edit, member-read; freeform markdown (`roadmap.md:136–138`). Celebrant reads. Multi-tab consistency: edits re-render on the celebrant's other open tab once `setTripNotes` calls `revalidatePath` (issue #159).
- **Field input mode (celebrant view-only):** freeform read.

**RSVP state on dashboard**
- Going / maybe / declined. Personal decline is whispered (organizer-only per-name; aggregate count to all members via `trip_members_visible_rsvp` view) (`decisions.md:519–546`, `roadmap.md:249`).
- RSVP icons accompany color (green check / yellow `?` / gray ×) per #45 — celebrant with deuteranopia/protanopia reads state correctly.

**Member directory ("meet the crew")**
- [UNSPECIFIED — open question: persona-groom.md:50 explicitly asks for self-authored one-line bios on a member directory ("FIL's friend Tom doesn't show up not knowing anyone"). M3 ships a roster page with vCard download + copy-numbers (`decisions.md:31–33`). M4 DoD does not extend it. See section 6.]

**Veto / silent remove**
- [UNSPECIFIED — open question: persona-groom.md:38 wants a quiet "remove" on itinerary items that does NOT notify the proposer. M4 doesn't add this. The M3 organizer-write/member-read model means the celebrant can't remove items anyway. See section 6.]

**"I'm overwhelmed, Dave handle it" / co-organizer handoff**
- [UNSPECIFIED — open question: persona-groom.md:64 calls for a 7-day silence + power-transfer button. Co-organizer role exists from M2 (`decisions.md:1203–1218`). The UX to lateral on demand is not in M4 DoD. See section 6.]

---

## 3. What the organizer (best man) sees and can do

**Login → dashboard**
- Same magic-link / token-hash flow as celebrant (`decisions.md:137–206`). On landing, organizer-only affordances show: Invite link card, lodging-assign dropdown, per-item member-flag composer.

**Itinerary composer (the big M4 surface)**

For every itinerary item the organizer adds or edits, M4 changes six freeform fields:

1. **Dress-code chip picker** (#163)
   - 7 chips: `Black tie · Smart casual · Cocktail · Beach formal · Loud shirts · Athleisure · Custom`
   - Picking a preset sets `itinerary_items.dress_code text` to the preset string verbatim (no migration needed — the column already exists).
   - Picking `Custom` reveals the existing freeform text input; stored value can be anything ("Custom: hawaiian-shirt-mandatory" per #163 body, or just the freeform string itself).
   - **Field input mode: hybrid (suggested chips + Custom fallback).**
   - ADR compatibility: rule #8 — chips are *suggestions*, not enums (#163 body).
   - [UNSPECIFIED — open question: does the `Custom` chip prefix the stored value with `"Custom: "`, or store the raw user text? Issue #163 body uses an example with prefix; the migration `itinerary_items.dress_code text` column comment is silent. See section 6.]

2. **Activity-tag chip picker** (#164)
   - 9 curated chips: `beach · nightlife · outdoor · food · chill · sports · culture · spa · adventure`
   - Custom-add inline: type a new tag, hit enter, it joins as a chip.
   - On save: lowercase + trim normalization so `Beach` / `beach` / ` beach ` collapse to one (#164 body).
   - Schema unchanged: `itinerary_items.activity_tag text[]` already stores arbitrary strings (`migrations/20260520052357_m3_itinerary_announcements.sql:82–86`).
   - **Field input mode: hybrid (curated chips + custom-add).**
   - ADR compatibility: rule #8 — suggestions, not enums.

3. **Per-item member-flag chip picker** (#165) — **organizer-only composer**, but the field-owning member is the writer
   - 11 chips: `vegan · vegetarian · gluten-free · nut allergy · shellfish allergy · sober · late arrival · early departure · plus-one · skipping this one · Custom`
   - This is the *flagship* "don't encode a default" field (#165 body); chips are convenience over the freeform `flag text` column.
   - Optional freeform `note` field below stays freeform (#165 body).
   - SELECT RLS: organizers ONLY — members can write their own flags but cannot see any flags after submission (`migrations/20260520052357_m3_itinerary_announcements.sql:494–537`).
   - **Field input mode: hybrid (preset chips + Custom fallback).** Note: in section 4 below, the *member* (not the organizer) is the typical writer of these.
   - [UNSPECIFIED — open question: voice test on `skipping this one`. It's a chip on a member-flag picker that the organizer reads; it's also functionally redundant with the per-item RSVP `skipping` status. Same data, two surfaces? See section 6.]

4. **Address autocomplete via Google Places** (#166)
   - Type → autocomplete dropdown → pick → stores both human-readable `address text` AND new `address_place_id text` + `address_provider text`.
   - Schema migration in M4: `add column address_place_id text, add column address_provider text` (#166 body).
   - Maps deep link prefers `place_id`-based universal link when present; falls back to existing string-query (#166 body).
   - Freeform fallback: dismiss the autocomplete suggestions, type anything; `address_place_id` stays null.
   - Dependency: `GOOGLE_PLACES_API_KEY` in Vercel env. New external dep — first one in the stack.
   - **Field input mode: hybrid (autocomplete + freeform fallback).**
   - ADR compatibility: rule #8 doesn't apply — addresses are physical-world entities, not user-state defaults (#166 body).
   - [UNSPECIFIED — open question: the Places API key is `GOOGLE_PLACES_API_KEY` — is this `NEXT_PUBLIC_*` (browser-visible, restricted by HTTP referrer) or server-only (the autocomplete fetch proxies through a Next.js route)? Issue #166 says "fetch the autocomplete endpoint directly" — direction is ambiguous. See section 6.]
   - [UNSPECIFIED — open question: Mapbox and Apple MapKit are listed as alternatives in #166 body; "Recommendation: Google Places" — but no decision is recorded in `decisions.md`. The roadmap line 186 says "Places API" without naming the provider. See section 6.]

5. **`datetime-local` widget on non-lodging items** (#167)
   - Form field is `<input type="datetime-local">` for `kind in ('event', 'meal', 'transport', 'activity')`. Lodging keeps date-only.
   - On submit, the datetime is split into `itinerary_items.day date` + `itinerary_items.start_time time` (#167 body). Optional second `datetime-local` for `end_time`.
   - Schema unchanged (`day`, `start_time`, `end_time` all already exist from M3).
   - **Field input mode: structured widget (browser-native datetime-local).** No freeform fallback — the browser widget is the input.
   - This is what makes the now/next dashboard card transition correctly (#167 body, `roadmap.md:133–135`).

6. **Airline + flight-number picker for travel legs** (#168) — *organizer-affordance only when they're entering their own travel leg; arrivals are owner-write*
   - For `kind = 'flight'`: airline picker (top-50 IATA codes + names) reveals; flight number text field next to it.
   - For `kind in ('train', 'drive', 'other')`: freeform `carrier text` field as today.
   - Schema migration in M4: `add column airline_iata char(2), add column flight_number text` (#168 body). Existing `carrier text` retained for non-flight cases.
   - Top-50 airlines list seeded as a constant in `lib/data/airlines.ts` (#168 body) — no DB table, no query.
   - **Field input mode: hybrid (preset airline picker + `Other` reveals freeform carrier).**
   - ADR compatibility: rule #8 doesn't apply — airlines are physical-world entities.
   - [UNSPECIFIED — open question: where does the airline picker live in the form? Issue #168 says "airline picker + flight number" but doesn't show the chip-vs-dropdown choice. Top-50 in a dropdown is fine; in a chip grid would be unusable. See section 6.]

**Invite minting**
- `/trips/[tripId]/invites` page shows organizer-only invite link card with mint affordance + revoke (`decisions.md:31–35`).
- M4 hardens this further:
  - `createInviteAction` accepts `idempotency_key` (#158). A drunk best man double-tapping "Mint a link" on bad cell signal no longer creates two rows.
  - SELECT RLS on `invites.token` tightens from `is_trip_member` to `is_trip_organizer` (#155). M3 shipped a page-level gate as load-bearing; M4 makes the DB enforce it.
  - Revoke moves from "select-after-update detector" to either a SECURITY DEFINER `revoke_invite(token)` RPC OR a column-scoped UPDATE policy on `expires_at` (#154 body).
  - [UNSPECIFIED — open question: which option for #154 — RPC or column-scoped UPDATE policy? Issue #154 lists both; roadmap line 188 just says "invites RLS tightening (#154 UPDATE policy / revoke RPC)". See section 6.]
- M4 also fixes the stale "Share the link" dashboard card from prod walk (#161) — either remove it (recommended in #161 body) or update its body string.
- **Field input mode (invite mint form):** structured (button → POST). Reveal-on-success returns a copyable URL.

**Lodging assignments**
- Lodging-assign dropdown lists members; falls back through `display_name ?? email ?? id` so a fresh trip doesn't render UUIDs (#160).
- Assignment writes to `lodging_assignments (item_id, trip_member_id, room_label)` (`migrations/20260520052357_m3_itinerary_announcements.sql:131–149`).
- `room_label` field: freeform text (e.g., "King Suite").
- **Field input mode:** structured (member dropdown), freeform (room label).

**Member-flag organizer view**
- Organizer sees the union of every member-flag row for an item (`migrations/20260520052357_m3_itinerary_announcements.sql:494–512`).
- Use case: opens a restaurant item, sees `Priya: shellfish allergy · Jake: vegetarian · Devin: sober` before picking the venue. Matches the persona-edge-attendees.md:60 requirement: "surfaced at the itinerary-add step, not buried on a profile."

**Announcements composer**
- Organizer-write; member-read; visibility enum dropdown (`everyone | organizers_only | hide_from_celebrant`) shipped in M3 (`components/trip/announcements/announcement-composer.tsx`).
- M4 does not change this.
- **Field input mode:** freeform body, structured visibility.

**Trip notes editor**
- Organizer-edit, member-read. Multi-tab revalidates per #159.
- **Field input mode:** freeform markdown.

**Rate-limit posture (organizer-felt, not visible)**
- M4 ratchets per-scope budgets (#141): `AUTH_MAGIC_LINK` → 5/hour, `ACCEPT_INVITE` → 10/hour, `CREATE_TRIP` → 10/hour, `SET_RSVP` → 30/60s (drunk-double-tap), `CAST_DATE_VOTE` → 30/60s.
- Per-scope fail-closed when the in-memory shim is active in prod (#139): `AUTH_MAGIC_LINK` and `ACCEPT_INVITE` refuse to proceed; `SET_RSVP` / `CAST_DATE_VOTE` / `CREATE_TRIP` keep allow-with-warning so a Vercel env-var regression doesn't brick the dashboard mid-trip.
- Upstash hostname allow-list (`.upstash.io` suffix, per #140) prevents a hostile env-var write from pointing the client at an attacker.

**Microcopy review**
- Organizer's PR is gated by the microcopy checklist in `.github/pull_request_template.md` (`CLAUDE.md` voice section). Every string shipped passes "would you say this at a pre-trip dinner?"
- Sample copy under review for the new chip pickers:
  - Dress-code empty state: needs key. [UNSPECIFIED — see section 6.]
  - Activity-tag empty state: needs key. [UNSPECIFIED — see section 6.]
  - Member-flag picker title: needs key. [UNSPECIFIED — see section 6.]

---

## 4. What an edge attendee (broke + sober + shellfish-allergic) sees and can do

Master principle (`persona-edge-attendees.md:11–18`): non-default attendees opt INTO participation, not OUT of assumptions. Pressure-test M4 against this.

**Composite attendee: Marcus (broke), who is also sober, also shellfish-allergic.**

**On accepting the invite**
- Magic link → `/auth/callback` → trip dashboard. Cross-device click works (`decisions.md:154–158`).
- No "tell us about yourself" intake. No "dietary restrictions" form. He sees the same dashboard as Tasha and Hugo (`ux-design-principles.md:145–155`).

**Setting his per-item member flags**
- For each itinerary item that matters, Marcus opens the item and adds member-flag chips for himself:
  - On the seafood-restaurant item: picks `shellfish allergy` chip (#165 preset). Saved to `itinerary_item_member_flags (item_id, trip_member_id, flag='shellfish allergy', note=null)`.
  - On any bar/club item: picks `sober` chip. Note: NOT marked as a profile flag — per-item, per-`persona-edge-attendees.md:54` ("a 'sober' flag on profile. Even private-to-organizers makes him *The Sober One*").
  - On the 1am club leg specifically: per-item RSVP → `skipping` chip (silent opt-out per `migrations/20260520052357_m3_itinerary_announcements.sql:198–199`). No notification fires.
  - On the helicopter add-on: per-item RSVP → `skipping`. Marcus is not "in on the helicopter" by default any more than he is "out" — he just picks (`persona-edge-attendees.md:23–30`).
- The chips Marcus adds are **invisible to other members** by RLS (organizer-read only) (`migrations/20260520052357_m3_itinerary_announcements.sql:494–512`). Devin doesn't know Marcus is sober. Priya doesn't know Marcus is shellfish-allergic.
- Marcus also cannot see his own flags after submitting them — the SELECT policy is organizer-only (no "self-read") (`migrations/20260520052357_m3_itinerary_announcements.sql:494–512`).
  - [UNSPECIFIED — open question: should the member see their own flags after writing? The current SELECT policy says no — even self-read is blocked. Persona-edge-attendees.md doesn't speak to this directly. The chip picker form would either need to re-query (denied) or hold local state from the last write. See section 6.]

**Dress code on a Saturday-night dinner item**
- Marcus opens the item. Sees: `Smart casual` chip rendered on the card (from #163 preset).
- He understands the expectation without anyone having to text him.
- Voice test: `Smart casual` passes. PASSES.

**RSVP**
- Per-trip RSVP: `going` (he's coming). M2 ships this (`decisions.md:99`).
- Per-day RSVP: he marks Friday + Saturday (he can only afford 2 nights). M3 ships per-day via `trip_member_days` (`migrations/20260519123255_m1_foundation.sql:trip_member_days...`).
- Per-item RSVP: silent opt-out on the helicopter, the chef dinner, the 1am club leg. Each opt-out is invisible to peers, organizer-readable in aggregate.

**Money pool**
- N/A in M4. Money pool ships in M5 only (`roadmap.md:213–217`, `killed-and-deferred.md:65`).
- Marcus pays the Airbnb deposit out of band via Venmo to whoever fronted it. App doesn't try.
- This is a known persona-edge-attendees.md:23 gap that M4 *does not close*. Master principle is held at the schema level for the data primitives M4 has — itinerary, RSVP, flags — and explicitly *deferred* for money primitives.

**Hugo (long-distance / late arrival) overlay**
- Hugo lands Fri 4pm local. Adds a travel leg: `kind=flight`, airline picker → `British Airways · BA 0285`, `depart_at` and `arrive_at` via two `datetime-local` widgets (#167, #168).
- Trip-local TZ rendering (#108) means the arrivals manifest shows `Fri 4:12pm` in the trip's TZ, not Hugo's London TZ.
- Hugo adds `late arrival` member-flag chip on the Thursday kickoff dinner item — silently. Organizer sees "Hugo: late arrival" on that item's flag card; doesn't have to bug Hugo for arrival info via DM.
- The arrivals manifest now correctly attributes the leg to Hugo's `display_name`, not the literal string "Someone" (#162).
- Money proration: deferred to M5 (`persona-edge-attendees.md:75`, `roadmap.md:213–217`).

**Tasha (+1 Bridge) overlay**
- Roster page from M3 has names + numbers. Tasha can copy-all-numbers to set up an iMessage thread (`decisions.md:31–33`).
- [UNSPECIFIED — open question: persona-edge-attendees.md:94 calls for self-authored one-line bios on member directory ("Ryan — groom's college roommate, lives in Austin, was at Cabo"). M3 ships vCard + copy-numbers; M4 DoD doesn't extend it. Tasha is still calling someone Brian when it's Ryan. See section 6.]
- Per-event "what to wear" — Tasha sees the dress-code chip on each item. The "what to wear" anxiety is half-solved by #163 (`persona-edge-attendees.md:96`).

**Voice test gates (Marcus + Devin + Priya + Hugo + Tasha apply)**
- `Loud shirts` (dress chip): party-appropriate, friendly. PASSES.
- `late arrival` (flag chip): factual, no judgment. PASSES.
- `Custom` (chip on all three pickers): generic but unavoidable. PASSES (acceptable filler).
- `skipping this one` (flag chip): risks reading as petty if surfaced via a "Marcus is skipping" string. Backstop: organizer-only RLS + no notification (`migrations/20260520052357_m3_itinerary_announcements.sql:494–512`). Internal-only string never reaches a peer. PASSES the voice test *for the organizer who reads it*.
- [UNSPECIFIED — open question: the chip-picker label that introduces the member-flag UI. M3 ships `item-flag-form.tsx` but the heading/microcopy is unknown. Needs voice test on something like "Anything we should know?" vs the corporate "Dietary restrictions." See section 6.]

---

## 5. Cross-cutting: visibility, idempotency, currency, voice

These are the load-bearing invariants from `CLAUDE.md` rules #7–#11. M4 must not break them.

**Rule #7 — Visibility-first feature design.** Every user-content table carries `visibility trip_visibility not null default 'everyone'`. M4 adds no new content tables. Existing tables retain visibility-aware RLS. Surprise mechanics still work. PASSES.

**Rule #8 — Don't encode a default.** This is the rule under the most active pressure in M4. The six structured-input surfaces are all *suggest-with-fallback*, not enums replacing freeform (`roadmap.md:178–186, 199–200`). Specifically:
- Dress-code: `dress_code text` stays text; chips select preset strings (#163).
- Activity tag: `activity_tag text[]` stays text array; chips suggest, custom-add allowed (#164).
- Member-flag: `flag text` stays text (not enum); chips are *the* flagship of "don't encode a default" (#165 body).
- Address: `address text` retained; new `address_place_id text` + `address_provider text` added alongside, not replacing (#166).
- Airline: existing `carrier text` retained; new `airline_iata char(2)` + `flight_number text` *for flights only*, `Other` reveals freeform `carrier` (#168).
- Datetime: `day date` + `start_time time` already structured pre-M4. M4 just wires the UI (#167).

PASSES. The ADR holds.

**Rule #9 — Idempotency on mutations.** M4 closes the last organizer-acting gap: `createInviteAction` accepts `idempotency_key` with partial unique on `invites (trip_id, idempotency_key)` (#158). Drunk-double-tap on bad cell signal stops minting duplicate links. PASSES.

**Rule #10 — Currency on money fields.** M4 ships no new money columns. The currency sibling pattern is held in M1 (`migrations/20260519123255_m1_foundation.sql:currency...`); no regression in M4. PASSES.

**Rule #11 — Roles add micro-affordances, not gates.** The new structured-input pickers are organizer-facing composers (chip picker for dress-code, activity-tag, address autocomplete, datetime, airline) plus a member-facing composer (member-flag picker — written by the member, read by the organizer). No new "access denied" copy. Celebrant sees the rendered output of organizer choices on item cards; no "you can't edit this" string. PASSES.

**Voice test (`CLAUDE.md` voice section).**
- M4 enforces the microcopy review checklist as a *hard gate* in the PR template (`roadmap.md:173`). No UI-touching PR merges without the checkbox.
- New chip labels reviewed under "would you say this at a pre-trip dinner?":
  - PASS: `Black tie`, `Smart casual`, `Beach formal`, `Loud shirts`, `vegan`, `gluten-free`, `nut allergy`, `shellfish allergy`, `sober`, `late arrival`, `early departure`, `plus-one`, `beach`, `nightlife`, `outdoor`, `food`, `chill`, `sports`, `culture`, `adventure`.
  - QUESTIONABLE: `Athleisure` (slightly corporate), `Cocktail` (reads as a drink in context of a chip labeled "dress code"), `spa` (off-vibe for bachelor party — surface only?), `skipping this one` (functional but reads as petty if any string surfaces it peer-side; RLS keeps it organizer-only).
  - The QUESTIONABLE list is where the sim should pressure-test microcopy.

**A11y (#82, #45).**
- axe-core CI step on Playwright E2E. No violations of impact ≥ `serious`.
- Lighthouse mobile ≥ 90 perf/a11y/best-practices on trip dashboard.
- RSVP icons accompany color (green check / yellow `?` / gray ×) — never color-only (#45).
- Color-blind manual review (deuteranopia / protanopia) passes.
- New chip pickers: focus ring per #121 (2px persimmon, 2px offset, *not* shadcn default). Keyboard nav works.
- [UNSPECIFIED — open question: do chip pickers announce correctly to VoiceOver/TalkBack? #82 requires no axe violations ≥ serious, but doesn't pin chip-specific behavior. See section 6.]

**Hard-banned UI patterns (`CLAUDE.md` "What NOT to do").**
- M4 introduces no leaderboards, streaks, badges, achievement unlocks, notification settings, tooltips, onboarding banners, completion scores, required asterisks, mascots, reaction inflation, or penis-anything. PASSES.

---

## 6. Decisions the sim should resolve

Numbered list of every `[UNSPECIFIED]` reference above, plus places where two sources point in opposite directions. **This is the load-bearing section** — the sim exists to answer these.

1. **#108 trip-local TZ fix path.** Quickest (UTC mid-day anchor) vs Right (`trips.timezone` column + `date-fns-tz`). Roadmap line 188 doesn't pick one. The "Right" option implies a timezone picker on `/trips/new`. The "Quickest" option is one-line — but pushes pain to the next bug. (Section 2)

2. **Blur-gradient pattern for hidden items.** `ux-design-principles.md:51–73` describes a frosted-blur pattern where the celebrant sees the *slot* (date/time/category) but content is blurred. M3 RLS filters the row entirely. Does M4 implement the blur pattern (requires a separate query path that returns a *masked* shape, not a filtered one) — or does M4 ship "hidden = invisible, no slot, no shadow"? Tension: persona-groom.md:41 says "with NO '🔒 1 hidden item' teaser. Just gone from his view." This points to current M3 RLS shape. UX principles point to blur-gradient. **Two sources, opposite directions.** Section 2 + 5.

3. **Athleisure chip voice test.** Borderline-corporate in a dress-code picker. Keep or rewrite? (Section 2/3/5)

4. **First-login groom intake (3-question vibe-tag seed) per persona-groom.md:63.** In or out of M4? Persona calls for it; M4 DoD is silent. (Section 2)

5. **Member directory with self-authored one-line bios** per persona-groom.md:50 and persona-edge-attendees.md:94. Critical for Tasha (+1 Bridge). M4 DoD doesn't include it. (Section 2 + 4)

6. **Silent itinerary-item veto** per persona-groom.md:38. Celebrant currently can't remove items (organizer-write only). Is this gap deliberate for M4? (Section 2)

7. **"Dave handle it" / co-organizer-handoff button** per persona-groom.md:64. Co-organizer role exists from M2; the handoff UX does not. M4 DoD silent. (Section 2)

8. **Dress-code Custom-chip storage prefix.** Does it store `"Custom: hawaiian-shirt-mandatory"` or just `"hawaiian-shirt-mandatory"`? Issue #163 body example uses prefix; the column comment doesn't pin it. Affects how the item card renders the value. (Section 3)

9. **"Skipping this one" flag-chip duplication with per-item RSVP `skipping`.** Same data, two surfaces? Or is one private-note (member-flag) and one structural (RSVP)? If the latter, what's the voice difference? (Section 3 + 4)

10. **Google Places API key visibility.** `NEXT_PUBLIC_*` (browser, HTTP-referrer-restricted) vs server-only (proxy via Next.js route). Issue #166 says "fetch the autocomplete endpoint directly" — ambiguous direction. Affects rate-limit posture (a browser-visible key can be scraped). (Section 3)

11. **Places provider choice.** Google vs Mapbox vs Apple MapKit. Issue #166 recommends Google; no decisions.md entry locks it. New external dep without an ADR is a CLAUDE.md "don't add deps without flagging" concern. (Section 3)

12. **#154 invites UPDATE RLS path.** SECURITY DEFINER `revoke_invite(token)` RPC vs column-scoped UPDATE policy on `expires_at`. Issue #154 lists both as options. (Section 3)

13. **Airline picker UI shape.** Dropdown vs autocomplete vs grid for top-50 IATA? At 50, dropdown is acceptable; grid is unusable; autocomplete is best. Issue #168 doesn't pin. (Section 3)

14. **Empty-state and label microcopy** for the three new chip pickers (dress, activity-tag, member-flag). Voice-test review required before merge per the M4 PR-template gate. Specific strings not yet in `lib/copy/empty-states.ts`. (Section 3 + 5)

15. **Member self-read of their own member-flags.** Current SELECT RLS is organizer-only — member cannot re-read after writing. UX implication: edit flow must hold local form state from last write, or use a server action that returns the row. (Section 4)

16. **Member-flag composer heading microcopy.** "Anything we should know?" vs "Dietary restrictions" vs other. Voice-critical; the persona-edge-attendees.md whole point is *not* to surface "you have a restriction." (Section 4)

17. **Chip-picker a11y announcement.** Do the chip pickers announce correctly to VoiceOver/TalkBack? Axe-core ≥ serious doesn't pin chip-specific behavior. (Section 5)

18. **Microcopy on `Athleisure` / `Cocktail` / `spa` chips.** Each is a candidate for rewrite under the voice test. Specifically: a `Cocktail` chip on a *dress code* picker is ambiguous (drink vs cocktail-attire). (Section 5)

19. **Theming pass scope (#90, #121).** What does "party-specific colors, hero image, party name" actually surface? Roadmap line 169–170 just names them. Persona-groom.md doesn't specify hero-image preferences. Open: is theming organizer-configurable per trip, or hardcoded per `trip_kind`? (Section 2 + 3, implied but not detailed)

20. **`/legal/terms` and `/legal/privacy` voice.** Issue #81 explicitly flags legal pages as "the silent place SaaS voice creeps back in." What's the voice for legal copy that passes the dinner test without being legally inadequate? (Section 5)

21. **#83 custom-domain mechanics on Vercel Hobby (Vercel Marketplace).** Roadmap line 168 says "custom domain wired up in Vercel." Operationally: which domain? When does DNS cut over (preview vs prod)? Issue #83 is one line. (Section 1)
