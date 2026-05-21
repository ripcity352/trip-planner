# ADR + roadmap drafts (Agent D)

> Drafts for lead review. Nothing in `notes/decisions.md` or
> `notes/roadmap.md` has been touched. Each ADR is formatted to prepend
> to `decisions.md` (newest-at-top); the roadmap diff is side-by-side
> old → new; the tracking issue is ready for `gh issue create`.
>
> Source materials read:
> - `notes/decisions.md` lines 1–300 (ADR-format match)
> - `notes/roadmap.md` lines 163–202 (M4 DoD)
> - `notes/sim/2026-05-20/findings.md` (synthesis)
> - `notes/sim/2026-05-20/findings-critic.md` re-audit batches 1–4
> - `notes/sim/2026-05-20/findings-edge.md` (Finding #10 addendum)
> - `notes/sim/2026-05-20/findings-organizer.md` (Findings #4, #17)
> - `notes/killed-and-deferred.md:26` (outbox kill)
> - `CLAUDE.md` voice section + rule #8

---

## ADR 1: Call A — full-filter + decoy-item

```markdown
## 2026-05-20 — M4 sim: full-filter wins for hide_from_celebrant + decoy-item workaround pattern

**Decision:** For `visibility=hide_from_celebrant` content, the existing
M3 RLS-filter shape — row excluded from the celebrant's `SELECT`
entirely, no slot rendered — is the right answer. The frosted-blur
pattern described in `notes/research/ux-design-principles.md:51-73`
(celebrant sees the slot, content blurred) is **out of scope for M4
and most likely M5**. Revisit only if a real-trip retrospective
surfaces a concrete "celebrant felt the absence" moment.

For multi-hour surprise windows where the celebrant might notice a
literal time-gap, organizers use the **decoy-item pattern**: add a
`visibility=everyone` decoy item ("free time / regroup at 5:30",
"recovery at the Airbnb") in the same slot. Honest, no lie, fills the
gap. Works in M3+M4 today, zero schema change.

**Rationale:**

Three sources had to be reconciled:

1. `notes/research/persona-groom.md:41` — full-filter (celebrant
   doesn't see the slot at all).
2. M3 shipped RLS shape — `can_see_content()` (m1 migration:171–188) is
   a **boolean predicate** used inside the itinerary `SELECT` policy
   (m3 migration:233–237). Row is filtered server-side; client never
   receives it. Full-filter.
3. `notes/research/ux-design-principles.md:51-73` — frosted blur with
   slot visible.

Two of three sources agree. The technical critic (re-audit batch 2)
verified the blur path would require a **new masked-SELECT shape**:
`can_see_content()` is boolean, not a sanitizer, so a blur surface
would need either a separate view exposing slot metadata (`day`,
`start_time`, `category`) without the content, or a SECURITY DEFINER
RPC returning a sanitized projection. That's a new query path and a
new RLS surface. The full-filter pattern that already ships does the
right thing for the persona — `roadmap.md:194` STOP HERE held.

The celebrant walk independently surfaced the same call:
*"a frosted 9pm card with `Saturday 9pm · Activity` metadata visible
is a teaser by another name, and David would have started guessing.
Filter wins; just write it down."* (`findings-celebrant.md:168`)

**Decoy-item workaround pattern (LOAD-BEARING):**

The critic re-audited the decoy pattern against current RLS
(`findings-critic.md` re-audit batch 2):

- Celebrant `SELECT` returns only the `everyone` decoy row;
  organizer `SELECT` returns both. ✓
- No `(trip_id, day, start_time)` uniqueness constraint on
  `itinerary_items` — two items at the same slot is structurally
  indistinguishable from real scheduling overlap. **That's the
  win, not a leak — plausible deniability.**
- `itinerary_item_rsvps` on the decoy is innocuous (celebrant can
  RSVP `going` to "free time"); no cross-leak to the hidden item.
- `lodging_assignments` cross-trip guard (trigger
  `assert_lodging_item_kind_before_assignment`, m3 migration:557–582)
  blocks lodging-assignment to a non-lodging decoy.

Pattern is RLS-tight today, no schema delta needed. Organizer copy
guidance for the decoy lives in the M4 microcopy PR.

**Future-decisions guardrail (CRITICAL FOR M5+):**

**Never ship an activity feed, recent-changes surface, or any
visualization exposing `created_at` timestamps on itinerary items to
the celebrant.** The decoy pattern relies on slot-overlap plausible
deniability; a creation-timestamp-adjacent display would reveal the
decoy by adjacency (decoy and surprise are created seconds apart).
This guardrail is the load-bearing reason this ADR exists — without
recording it, future-Claude could re-propose an organizer-activity
or "what changed today" surface and silently leak the hidden item by
inference.

**Alternatives considered:**

- **Frosted-blur masked-SELECT (`ux-design-principles.md:51-73`).**
  Rejected because (a) it requires a new masked-SELECT shape because
  `can_see_content()` is boolean, not a sanitizer; (b) `roadmap.md:194`
  STOP HERE explicitly limits M4 polish; (c) the decoy-item pattern
  closes the same "celebrant might notice the gap" concern at zero
  engineering cost. The blur design earns its way back in only if a
  retro produces a specific celebrant-felt-the-absence moment that
  the decoy pattern couldn't cover.

**Implementation:**

- No code change. Filter shape already ships (m1 + m3 migrations).
- Microcopy PR ships organizer-facing copy guidance for the decoy
  pattern alongside the dress-code rename + member-flag composer
  heading.
- This ADR is the durable record of the call; cite it in any future
  PR/issue that re-opens the blur question.

**Sim citations:**

- Celebrant Finding C1 — `findings-celebrant.md:6` (blur vs filter,
  filter wins)
- Organizer Finding O2 — `findings-organizer.md:15` (hide_from_celebrant
  render path)
- Organizer cross-DM addendum — `findings-celebrant.md:81–85` (decoy
  pattern surfaced via celebrant walk)
- Critic pre-load — `findings-critic.md` (initial filter-wins recommendation)
- Critic re-audit batch 2 — `findings-critic.md:444–451` (decoy RLS
  verification + activity-feed guardrail)
- Synthesis Call A — `findings.md:52–53`
```

---

## ADR 2: Call B — organizer-write-on-behalf for member-flags (M5+ scope, principle holds with attribution)

```markdown
## 2026-05-20 — M4 sim: organizer-write-on-behalf for member-flags — M5+ scope, principle holds with attribution

**Decision:** Organizer-write-on-behalf for `itinerary_item_member_flags`
is **M5+ scope**, deferred from M4. **The master principle stated in
`persona-edge-attendees.md:11-18` (non-default attendees opt *in*, the
app doesn't *assume*) HOLDS with attribution + member-confirm** — the
M5 design must not treat this as a principle-inversion fight. The
principle protects against the app *assuming* a default; it does NOT
protect against an organizer *recording* what an attendee already
volunteered out-of-band. **This wording is load-bearing; do not soften
it.**

**Reconciliation of the disagreement:**

This call was contested through the sim:

1. **Initial critic framing (pre-load):** organizer-on-behalf inverts
   the opt-in principle — the app would be acting on behalf of a
   member who hasn't tapped, which looks like the same kind of
   "assume the default" pattern rule #8 was written to prevent.
2. **Organizer pushback (`findings-organizer.md:33–40`, Finding #4):**
   the M3 schema already lets organizers write on behalf of members
   for `lodging_assignments` (migration
   `20260520052357_m3_itinerary_announcements.sql:131-149`). That
   precedent shows the project can express "organizer banks an
   attendee fact" without violating the principle, *given the right
   attribution.* Workaround today ("text Marcus to open the app") is
   literally the asymmetric-labor problem
   `persona-best-man.md:69` names.
3. **Edge-attendee addendum (`findings-edge.md:90–99`, Finding #10):**
   the affected persona — Marcus, the one the principle was written
   to protect — sided with the organizer in his own filing:
   *"transcribing a fact the attendee specifically volunteered via
   DM is recording, not assuming."* He proposed the three
   preserve-conditions below.
4. **Critic walk-back (`findings-critic.md:440`, re-audit batch 1):**
   the initial principle-inversion framing was retracted. *"Marcus's
   `written_by` + member-confirm proposal closes the principle
   objection."* Severity downgraded to "nice-to-have for M4, M5 retro
   if no budget."

**Three preserve-conditions (REQUIRED for any M5 implementation —
copy verbatim from `findings-critic.md` re-audit batch 1):**

1. **Attribution column:**
   `written_by_trip_member_id uuid references public.trip_members(id)` —
   NOT `auth.users(id)`. This matches the M1 FK-retargeting convention
   (`database-workflow.md:256-271`) and the existing `trip_member_id`
   column shape on the same table.

2. **Additive INSERT policy (do NOT widen the existing owner-insert
   policy):**
   Keep `"item flags: owner insert"` (m3 migration:514-525) unchanged.
   Add a second, additive policy
   `"item flags: organizer insert on behalf"`:
   ```sql
   with check (
     public.is_trip_organizer(...)
     and written_by_trip_member_id in (
       select id from trip_members where user_id = auth.uid()
     )
     and trip_member_id <> written_by_trip_member_id
   )
   ```
   The third clause is **load-bearing defense-in-depth**: without it,
   an organizer could write a flag claiming the member wrote it
   themselves (forged self-attribution). The clause forces
   `written_by` to be the acting organizer's own membership row and
   forbids it from matching the target.

3. **Member-confirm UI:** Once the M4 self-read SELECT policy lands
   (the M4 carry-back ship-blocker, three-persona convergence), the
   member-side picker surfaces organizer-written rows with a
   one-tap `"Dave saved this for you — keep it?"` confirm/remove
   affordance. The attribution column is honest; the confirm/remove
   makes the principle hold *in the UX*, not just in the schema.

**Why M5+ scope, not M4:**

The feature requires four moves in one wave: (a) schema add
(`written_by_trip_member_id` column), (b) RLS policy add (additive
INSERT), (c) server action plumbing for organizer-acting
write-with-attribution, (d) member-confirm UI on the chip picker.
That's three-of-four M4 budget hats in a single feature — schema,
RLS, UI, plus the copy review for the confirm string. The M4
carry-back migration already ships the self-read fix
(cross-persona ship-blocker), which is what unblocks the picker
end-to-end for the actual M4 trip. Write-on-behalf lands when the
post-trip retro confirms the asymmetric-labor problem actually
fired (Dave actually had to text Marcus to open the app, Marcus
actually didn't, the chef-venue actually missed the allergy).

If the M5 retro confirms the friction, the implementation is
mechanically ready — three preserve-conditions above, ~80 lines of
migration + policy + server action + picker affordance.

**What this ADR PREVENTS:**

Future re-litigation of the principle question. If you find yourself
debating whether organizer-on-behalf "violates opt-in," re-read the
edge-attendee's addendum (`findings-edge.md` Finding #10). The
principle protects against the *app* assuming; it does not protect
against an *organizer* recording what the attendee volunteered. The
attribution + member-confirm UI is the bridge between those two
positions and is the right design.

**Alternatives considered:**

- **Land in M4 with the three preserve-conditions.** Rejected on
  scope: too many M4 budget hats in one feature, and the M4
  self-read fix already unblocks the picker for the actual trip.
  Save the write-on-behalf surface for the retro-confirmed need.
- **Widen the existing owner-insert policy to allow organizer
  writes.** Rejected: the additive-policy pattern is safer to
  audit and reason about. Mixing owner-self and organizer-on-behalf
  semantics in one policy makes the third-clause defense-in-depth
  ambiguous to read.
- **Use a SECURITY DEFINER RPC** like `accept_invite`. Rejected:
  RLS can express the constraint directly with the additive policy.
  SECURITY DEFINER is the right tool when RLS *can't* express the
  constraint (atomic invite accept), not when it can.

**Sim citations:**

- Organizer Finding #4 — `findings-organizer.md:33–40`
- Edge-attendee addendum Finding #10 — `findings-edge.md:90–99`
- Critic re-audit batch 1 — `findings-critic.md:428–442`
- Synthesis Call B — `findings.md:55`
```

---

## ADR 3: Places provider lock + server-proxy + PLACES_AUTOCOMPLETE rate-limit scope

```markdown
## 2026-05-20 — M4 sim: Google Places API locked + server-proxy + PLACES_AUTOCOMPLETE rate-limit scope

**Decision:** Lock the M4 address-autocomplete provider (#166) to
**Google Places API**. A browser-visible API key
(`NEXT_PUBLIC_GOOGLE_PLACES_KEY` or similar) is **rejected** in favor
of a **server-proxy route handler** at
`app/api/places/autocomplete/route.ts`, fronted by a new rate-limit
scope `PLACES_AUTOCOMPLETE` in `lib/rate-limit/`.

**Rationale:**

- **Provider choice (Google):** team-lead lock during the sim
  (`findings-organizer.md:145`). Google Places has the best US bar /
  restaurant coverage for the actual use case (bachelor-trip venue
  picking). Mapbox and Apple MapKit JS were considered; Mapbox loses
  on small-business coverage in the US bar/restaurant long tail,
  Apple MapKit loses on cross-platform polish (the trip is shared
  across iOS + Android browsers). Closes
  `future-state-guide.md` open question #11.

- **Server-proxy, not browser-visible key:** the conventional move
  for a Next.js client-side Places integration is a `NEXT_PUBLIC_*`
  key with HTTP-referrer restrictions on the Google Cloud Console
  side. Three reasons we don't take that path:
  1. **HTTP-referrer is spoofable.** It's a header; anyone running
     curl can pretend to be `*.vercel.app`. Browser-visible keys are
     scrape-able from the bundled JS within seconds of a Vercel
     preview going live.
  2. **Places billing is real and abusable.** A leaked key with no
     rate-limit between it and the client is a cost-amplification
     surface. The MVP traffic is tiny but the abuse surface is
     globally addressable.
  3. **`lib/rate-limit/` already exists.** Routing through a server
     proxy lets us add a `PLACES_AUTOCOMPLETE` scope (per-user,
     consistent with `MINT_INVITE` / `ACCEPT_INVITE` / `SET_RSVP`
     buckets) and centralizes the key in Vercel project env. This
     is consistent with the #141 rate-limit ratchet posture.

- **Friction-vs-security clarification:** the project-memory note
  `feedback_friction_vs_security` addresses **user-flow** threats
  (e.g., PKCE-vs-token-hash on magic-link — see
  `decisions.md:137–207`). It does **not** apply to
  **infrastructure-cost** threats like an unauthenticated billing
  surface. The server proxy is +1 file (`route.ts`), zero
  user-visible friction. The user types in a chip picker; the proxy
  fetches and returns suggestions; the user never sees the seam.

**Schema impact (in M4 carry-back migration):**

```sql
alter table public.itinerary_items
  add column address_place_id text,
  add column address_provider text;
```

These columns close the schema portion of #166. The provider column
exists so a future Mapbox-or-other migration is a string-update, not
a re-key.

**Dependency declaration:**

This is a **new external dependency**. Per `CLAUDE.md` ("Don't add
new dependencies without flagging it in the response"): the dep is
Google Places Autocomplete API (Places API (New) endpoints, server-
side). **No new npm package** — the route handler uses Next.js's
built-in `fetch`. The only project-level deltas are:
- New env var `GOOGLE_PLACES_API_KEY` (server-only, Vercel-injected,
  documented in `.env.example`)
- One Google Cloud Console project + Places API enabled + billing
  card on file (owner action — `ripcity352`)
- New rate-limit scope constant added to `lib/rate-limit/`

**Alternatives considered:**

- **Mapbox** — bar/restaurant coverage gap (see provider choice).
- **Apple MapKit JS** — cross-platform polish gap; only worth it for
  iOS-only apps.
- **Browser-visible key with HTTP-referrer restriction** — spoofable,
  scrape-able, no rate-limit hook. Rejected.
- **OpenStreetMap / Nominatim** — usage policy forbids high-volume
  autocomplete; not designed for this workload.

**Sim citations:**

- Organizer Finding #17 — `findings-organizer.md:142–148`
- Critic pre-load — `findings-critic.md:94–100`
- Synthesis carry-back item — `findings.md:87`
```

---

## ADR 4: Edge #5 silent "heading back" ping — retired ask

```markdown
## 2026-05-20 — M4 sim: silent "heading back" ping — retired ask, safety case → text-organizer-directly

**Decision:** The persona ask for an in-app silent "heading back"
ping from an attendee to the organizer (`persona-edge-attendees.md:48`,
sober persona) is **retired in the form proposed**. The right product
answer for the safety-coded use case is **text the organizer
directly** — the organizer's phone is already on the M3 roster, with
the copy-all-numbers and vCard download surfaces shipped in PR #151.

**Why retired, not deferred:**

The persona ask, in the form proposed (in-app silent push to
organizer-only), has two structural problems:

1. **In-app push fires only when the recipient has the app open.**
   The scenario is Marcus leaving a club at midnight, wanting Dave
   to *know* he's heading back (safety case). For that signal to be
   safety-grade, Dave has to *get* it. In-app delivery is
   unreliable for that — Dave isn't checking the app at midnight;
   he's at the club too, or in an Uber. The signal needs to land on
   Dave's lock screen via SMS or a push channel he actively
   monitors. The M4 product has neither.

2. **The killed notification-outbox seam is correctly killed**
   (`killed-and-deferred.md:26`). The retro should not re-propose
   the outbox under safety-coded framing. The kill rationale —
   "premature abstraction; an outbox seam with no second channel is
   a pattern, not a product" — applies as strongly to a safety
   primitive as it did to the general case. The second channel
   arrives with money-pool nudges in M5; the seam is designed
   *then*.

3. **The M3 roster already solves this.** Dave's phone number is on
   the roster page (`/trips/[tripId]/roster`); Marcus can copy it
   or download Dave's vCard in two taps. Texting Dave "heading
   back" via the OS SMS app delivers reliably on every device,
   surfaces on a lock screen, and creates zero new infrastructure.

**Future-decisions guardrail:**

If a retro re-proposes a silent organizer-only ping primitive under
safety framing — e.g., "we need a panic ping for the sober persona"
— point at this ADR. The principled response is *"the M3 roster
already solves the safety case via OS-native SMS; the proposed
primitive trades reliability for in-app cleanliness, and reliability
is the load-bearing property for a safety signal."* If a real-trip
retro surfaces a use case where SMS-the-organizer would have failed,
that's the moment to re-open — not before.

**What stays open:** the general "heading back" use case where the
member just wants to *log* their early departure (not summon
attention) — that's already covered by per-item RSVP `skipping`,
which fires no notifications by design. Marcus can mark himself
`skipping` on remaining items at midnight; the per-item RSVP is the
canonical low-noise surface.

**Alternatives considered:**

- **In-app silent push (the persona ask as written).** Rejected for
  reliability reasons above.
- **Defer to M5 with the outbox seam.** Rejected: the kill rationale
  in `killed-and-deferred.md:26` still applies; the second channel
  is what unlocks the seam, not the use case framing.
- **Add SMS to the M4 stack just for this.** Rejected — SMS provider
  + Twilio account + abuse hardening for a single primitive is
  dramatic scope creep. The OS SMS app is already on every device.

**Sim citations:**

- Edge-attendee Finding #5 — `findings-edge.md:43–50`
- Critic re-audit batch 3 — `findings-critic.md:499–500`
- Synthesis retired-ask — `findings.md:78–80`
```

---

## Roadmap diff

### Before (lines 163–202):

```markdown
## M4 — Trip is shippable

The ship moment. Polish + the bright line marked **STOP HERE.**

**Definition of done:**
- Custom domain wired up in Vercel (#83)
- Theming pass: party-specific colors, hero image, party name
  (#90, #121)
- Mobile QA across iOS Safari and Android Chrome
- **Microcopy review** enforced as PR-template checklist for any UI string
- **`/legal/terms` and `/legal/privacy` stub pages** — pass the voice
  test (#81)
- **axe-core + Lighthouse a11y pass** per UI route (#82)
- **Color is never the only signal** — RSVP/state icons accompany color
  (#45)
- **Structured inputs with freeform fallback** — chip pickers + datetime
  widgets replace the M3 freeform fields where it's cheap to do so
  without violating the "don't encode a default" ADR (rule #8). Six
  surfaces:
  - Dress-code preset chips (#163)
  - Activity-tag chip picker (#164)
  - Per-item member-flag chips with custom fallback (#165)
  - Address autocomplete via Places API (#166) — new API-key dep
  - `datetime-local` widget on non-lodging itinerary items (#167)
  - Airline + flight-number picker for travel legs (#168)
- **M2/M3 carry-back follow-ups** — trip-local TZ (#108), invites RLS
  tightening (#154, #155), invite idempotency-key (#158), trip-notes
  revalidate (#159), itinerary emoji→SVG (#156), dead helper cleanup
  (#157), three prod-walk UX fixes (#160, #161, #162), rate-limit
  hardening (#139, #140, #141)
- **Send invite link to actual party attendees**
- **Stop here.** Use it for the real trip. Come back to M5 only after a
  retrospective surfaces what the trip actually needed.

**Out of scope:** every delight mechanic deferred to M5 (Drumroll,
Lock-In Day, Hot Seat — all killed; can earn back via retro).
Pure-enum replacements for the freeform text fields are out — the ADR
rules that out; M4 structured-inputs scope is *suggest-with-fallback*.

---
```

### After (lines 163–202, with sim-derived deltas inlined):

```markdown
## M4 — Trip is shippable

The ship moment. Polish + the bright line marked **STOP HERE.**

**Sim 2026-05-20:** 16 of 21 future-state-guide open questions
resolved; see `notes/sim/2026-05-20/findings.md` for the synthesis.

**Definition of done:**
- Custom domain wired up in Vercel (#83)
- Theming pass: party-specific colors, hero image, party name
  (#90, #121)
- Mobile QA across iOS Safari and Android Chrome
- **Microcopy review** enforced as PR-template checklist for any UI
  string (sim microcopy PR: #TBD-microcopy)
- **`/legal/terms` and `/legal/privacy` stub pages** — pass the voice
  test (#81)
- **axe-core + Lighthouse a11y pass** per UI route (#82)
- **Color is never the only signal** — RSVP/state icons accompany color
  (#45)
- **Structured inputs with freeform fallback** — chip pickers + datetime
  widgets replace the M3 freeform fields where it's cheap to do so
  without violating the "don't encode a default" ADR (rule #8). Six
  surfaces (schema/RLS deltas bundled into #TBD-carry-back):
  - Dress-code preset chips (#163)
  - Activity-tag chip picker (#164)
  - Per-item member-flag chips with custom fallback (#165)
  - Address autocomplete via Places API (#166) — new API-key dep
  - `datetime-local` widget on non-lodging itinerary items (#167)
  - Airline + flight-number picker for travel legs (#168)
- **M2/M3 carry-back follow-ups** (bundled into #TBD-carry-back) —
  trip-local TZ (#108), invites RLS tightening (#154, #155), invite
  idempotency-key (#158), trip-notes revalidate (#159), itinerary
  emoji→SVG (#156), dead helper cleanup (#157), three prod-walk UX
  fixes (#160, #161, #162), rate-limit hardening (#139, #140, #141)
- **Send invite link to actual party attendees**
- **Stop here.** Use it for the real trip. Come back to M5 only after a
  retrospective surfaces what the trip actually needed.

**Out of scope:** every delight mechanic deferred to M5 (Drumroll,
Lock-In Day, Hot Seat — all killed; can earn back via retro).
Pure-enum replacements for the freeform text fields are out — the ADR
rules that out; M4 structured-inputs scope is *suggest-with-fallback*.

---
```

**Diff summary:**
- 1 new line under heading: sim resolution count + pointer to
  findings.md
- Microcopy bullet: appended `(sim microcopy PR: #TBD-microcopy)`
- Structured-inputs group header: appended `(schema/RLS deltas
  bundled into #TBD-carry-back)`
- M2/M3 carry-back group header: appended `(bundled into
  #TBD-carry-back)`
- STOP HERE line: unchanged
- DoD structure: unchanged

---

## Tracking issue

**Command (run after `#TBD-*` placeholders are replaced with real issue numbers):**

```bash
gh issue create \
  --title "chore(m4): sim 2026-05-20 follow-through tracking" \
  --label "type:chore,area:trips" \
  --milestone "M4 — Trip is shippable" \
  --body-file <(cat <<'EOF'
## Context

Ran a persona-driven pressure test of the M4 future-state guide on
2026-05-20. Three personas (celebrant David, organizer Dave,
edge-attendee Marcus) walked the future-state spec; technical critic
audited against current schema + RLS + ADRs. Full synthesis in
[`notes/sim/2026-05-20/findings.md`](../tree/main/notes/sim/2026-05-20/findings.md).

**Net result:** 6 ship-blockers surfaced, all bundle into ONE carry-back
migration + ONE microcopy PR. 16 of 21 future-state-guide open questions
resolved (5 remain, all operational/per-PR — chip a11y, theming,
legal voice, custom-domain mechanics, partial chip empty-states).

## Work landing in M4

- **Carry-back migration:** #TBD-carry-back
  - Member self-read SELECT policy on `itinerary_item_member_flags`
  - `invites.idempotency_key` column (#158)
  - `invites.token` SELECT RLS tightening (#155)
  - `invites.expires_at` column-scoped UPDATE policy (#154)
  - `trips.timezone` column (#108)
  - `itinerary_items.address_place_id` + `address_provider` (#166)
  - `travel_legs.airline_iata` + `flight_number` (#168)
- **Microcopy PR:** #TBD-microcopy
  - Member-flag composer heading + subhead
  - `Cocktail` → `Cocktail attire` rename
  - `Athleisure` → `Golf casual` rename
  - "Dress code:" item-card label
  - Drop `skipping this one` chip from `lib/data/member-flags.ts`
  - `lib/copy/empty-states.ts` keys for the three chip pickers

## M5+ follow-ups (deferred with intent)

- #TBD-dashboard — composer dashboard (conditional, anti-creep
  constraints captured in ADR)
- #TBD-preview-as-celebrant — organizer "view as celebrant" toggle
- #TBD-write-on-behalf — organizer-write-on-behalf for member-flags
  (principle position locked in ADR; three preserve-conditions
  ready for M5 implementation)
- #TBD-bare-bios — bare bio column for member directory (not Crew
  Cards)

## ADRs landed in `notes/decisions.md`

- **Call A — full-filter + decoy-item pattern:** for
  `hide_from_celebrant`, the M3 RLS-filter shape wins; blur is M5+.
  Decoy-item pattern (`visibility=everyone` filler at the same
  slot) is the organizer workaround for multi-hour surprise
  windows. Critical M5+ guardrail: never expose item `created_at`
  to the celebrant.
- **Call B — organizer-write-on-behalf for member-flags is M5+,
  principle holds with attribution.** Three preserve-conditions
  documented (`written_by_trip_member_id`, additive INSERT policy
  with anti-forge clause, member-confirm UI).
- **Places API:** Google + server-proxy at
  `app/api/places/autocomplete/route.ts` + new `PLACES_AUTOCOMPLETE`
  rate-limit scope. Browser-visible key rejected.
- **Edge #5 retired-ask:** silent "heading back" ping retired in
  the form proposed; safety case routes to text-organizer-directly
  via the M3 roster.

## Verdict on M4 mandate

**The DoD as written is correct.** The sim mostly surfaced
organizer-narrative scope creep (composer dashboard,
write-on-behalf, preview-as-celebrant, member directory bios),
which `roadmap.md:194` STOP HERE held against. The one
near-blocker — composer dashboard — is conditional: ship only if
anti-creep constraints hold (3 flat lists, no badges, no counts in
headings, no interactivity); otherwise defer.

The single highest-leverage delta from the whole sim is the
additive SELECT policy on `itinerary_item_member_flags` for
owner-self-read. One line of SQL. Three-persona convergence.
Unblocks the #165 chip-picker UX entirely.

EOF
)
```

**Verified pre-flight:**
- `gh label list` → `type:chore` and `area:trips` both exist
- `gh api repos/:owner/:repo/milestones` → milestone "M4 — Trip is
  shippable" exists (number 5)
- `#TBD-*` placeholders must be replaced with the real carry-back
  migration issue, microcopy PR issue, and four M5+ follow-up
  issues before `gh issue create` runs
