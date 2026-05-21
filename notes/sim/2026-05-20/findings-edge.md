# Edge-attendee findings (Marcus, composite) — M4 pressure-test sim
> Composite: broke (Marcus §1) + sober (Devin §2) + dietary-restricted (Priya §3).
> Walked 2026-05-20 by `edge-attendee` teammate.
> Filed via SendMessage (subagent Write blocked by harness rule).
> Team-lead transcribed to file. Batch 2 pending.

### Finding: Member cannot read back their own flags after writing
- **Scene:** Wrote `shellfish allergy` chip on the chef-lunch item. Picker closed. No way to verify the row exists — not on the item card, not in the picker if I reopen it.
- **Persona:** edge-attendee (Marcus — dietary)
- **Today's reality:** SELECT RLS on `itinerary_item_member_flags` is organizer-only (`migrations/20260520052357_m3_itinerary_announcements.sql:494–512`). Self-read denied.
- **Guide says:** Section 4 line 184–185 confirms; section 6 #15 flags as open question.
- **Gap type:** UX + minor schema/RLS (one CREATE POLICY)
- **Severity:** ship-blocker for real trip
- **Where it lands:** roadmap.md M4

### Finding: No app-side confirmation that flag was delivered to organizer
- **Scene:** Even after self-read fix lands, I'd want to know Dave *saw* it, not just that the row exists.
- **Persona:** edge-attendee (Marcus — dietary)
- **Today's reality:** No read receipt, no nudge, no "organizer reviewed" affordance. Section 3 line 142 says organizer sees flag union only when they open the item.
- **Guide says:** Silent on delivery confirmation.
- **Gap type:** UX
- **Severity:** nice-to-have
- **Where it lands:** roadmap.md M5+ (organizer-dashboard "X flags need review" badge — NOT a per-flag receipt; per-flag review would replicate the persona §3 "ask Priya to approve each restaurant" anti-pattern)

### Finding: `skipping this one` flag chip vs per-item RSVP `skipping` chip — same data, two surfaces
- **Scene:** Skipping Thursday kickoff dinner. Two UI paths converge to the same outcome: per-item RSVP `skipping` chip, OR member-flag chip `skipping this one`. Both organizer-visible-only, both silent.
- **Persona:** edge-attendee (Marcus — broke, skipping cost-heavy items)
- **Today's reality:** Both surfaces exist (guide section 3 line 90; section 2 line 31).
- **Guide says:** Section 6 #9 flags as open: "same data, two surfaces?"
- **Gap type:** spec + UX
- **Severity:** nice-to-have
- **Where it lands:** decisions.md (record intent: RSVP is the surface) + roadmap.md M4 (one-line constant edit — drop `skipping this one` from `lib/data/member-flags.ts`)

### Finding: No way to opt out of items not yet on the itinerary
- **Scene:** Helicopter add-on mentioned in conversation but not added as an itinerary item. No app surface to express "not me on that."
- **Persona:** edge-attendee (Marcus — broke)
- **Today's reality:** Per-item RSVP and flags require a parent itinerary item to attach to.
- **Guide says:** Silent. M4 adds no phantom-item primitive.
- **Gap type:** spec
- **Severity:** out-of-scope
- **Where it lands:** drop (workaround: organizer adds helicopter as an item; member RSVPs `skipping`)

### Finding: No "heading back" silent ping during an event
- **Scene:** Club at 11:30pm, want Dave to know I'm out (safety). Don't want the group to know. Per-item RSVP `skipping` notifies no one — not even Dave.
- **Persona:** edge-attendee (Marcus — sober)
- **Today's reality:** Per-item RSVP is fully silent (guide section 2 line 31). persona-edge-attendees.md:48 asks for organizer-only silent ping; not in M4.
- **Guide says:** Silent.
- **Gap type:** spec
- **Severity:** nice-to-have
- **Where it lands:** roadmap.md M5+ (rides on notification outbox per killed-and-deferred.md:26)

### Finding: Late-arrival "what you missed" digest absent
- **Scene:** Hugo overlay lands 4pm Friday after Thursday + Friday-morning announcements. I (Marcus) drive in 2pm Friday with smaller version of same gap.
- **Persona:** edge-attendee (Hugo overlay; Marcus partial)
- **Today's reality:** Announcements feed is flat reverse-chron. No "since you were last here" filter or last-seen timestamp.
- **Guide says:** Silent. Section 4 line 211 references the persona ask; M4 DoD doesn't include it.
- **Gap type:** UX
- **Severity:** nice-to-have
- **Where it lands:** roadmap.md M5+

### Finding: Money settlement out of band — confirmed M5
- **Scene:** Sunday post-trip. ~$240 owed with proration for skipped chef seafood + bailed club leg + missed gag dinner. App has nothing. Dave Venmos me $347 a week later, no itemization. I pay because I trust Dave.
- **Persona:** edge-attendee (Marcus — broke)
- **Today's reality:** Money pool / proration / itemized opt-in deferred to M5 (`killed-and-deferred.md:65`, `roadmap.md:213–217`).
- **Guide says:** Section 4 line 198–200 confirms M5 scope.
- **Gap type:** killed-but-regretted (not regretted — correctly scoped)
- **Severity:** out-of-scope
- **Where it lands:** drop (M5 holds it; persona §1 "non-negotiable number vs whales tier" matters more for *deciding to come* than for *settling after*; Marcus already committed)

### Finding: Heading microcopy on the member-flag picker is unspecified
- **Scene:** Tap "+ flag" on the chef-lunch item. Picker opens with 11 chips. What's the heading above the chips?
- **Persona:** edge-attendee (Marcus — dietary + sober + skipping)
- **Today's reality:** `components/trip/itinerary/item-flag-form.tsx` exists from M3; heading microcopy not in `lib/copy/empty-states.ts`.
- **Guide says:** UNSPECIFIED (section 6 #14, #16; section 4 line 219 asks the sim to voice-test).
- **Gap type:** voice
- **Severity:** ship-blocker for real trip
- **Where it lands:** roadmap.md M4 (PR-template microcopy gate per guide section 5 line 246)
- **Recommendation:** heading `"Anything we should know?"`, subhead `"Just for the organizer — private to you."` Voice-test pass: friendly, broad enough to cover sober/late/plus-one, doesn't label, names privacy guarantee inline. Reject: `"Dietary restrictions"` (corporate, persona §3 nightmare).

### Finding: `Cocktail` chip on a dress-code picker is ambiguous
- **Scene:** Saturday dinner item. Dress-code chip says `Cocktail`. As Marcus (sober), brain parsed it ambiguously: dress code, or what they're serving?
- **Persona:** edge-attendee (Marcus — sober — drinking-cue ambiguity felt sharper)
- **Today's reality:** Chip in `lib/data/dress-codes.ts` preset list.
- **Guide says:** Section 6 #18 flags as one of three QUESTIONABLE dress chips.
- **Gap type:** voice
- **Severity:** nice-to-have
- **Where it lands:** roadmap.md M4 (label change in `lib/data/dress-codes.ts`)
- **Recommendation:** rename to `Cocktail attire`. Keep `Athleisure` (party-coded enough in 2026), keep `spa` as activity chip.

### Finding (addendum from organizer DM): Organizer-write-on-behalf for member flags — master principle position
- **Scene:** Organizer DM-cross-check: Marcus DM'd Dave in March with "broke/sober/shellfish." Chef-venue lock is this week (T-22). M4 chip picker requires Marcus's tap to bank the flag. Asymmetric labor problem (persona-best-man.md:69) — Dave should be able to write the flag now and let Marcus confirm later.
- **Persona:** edge-attendee (Marcus — dietary) reading the converse of organizer Finding #4
- **Today's reality:** INSERT RLS on `itinerary_item_member_flags` requires `auth.uid()` matching the `trip_member_id`'s user. Organizer cannot write on behalf.
- **Guide says:** Silent. M4 chip picker (#165) is member-write only.
- **Gap type:** spec
- **Severity:** ship-blocker for real trip (seconding organizer Finding #4)
- **Where it lands:** roadmap.md M4
- **Edge-side verdict on principle cost:** organizer-write-on-behalf is NOT a violation of `persona-edge-attendees.md:11–18`. The master principle protects against the app *assuming* a default about the attendee. Transcribing a fact the attendee specifically volunteered via DM is recording, not assuming. Marcus's gut reaction to "Dave banked my shellfish flag before I logged in" is relief, not violation — the alternative is the chef-venue lock missing the flag because Marcus is 22 days out juggling a job hunt.
- **Conditions for M4 ship (preserve principle):** (1) Flag carries `written_by trip_member_id` column — attribution is honest. (2) When self-read RLS lands (Finding #1), member-side picker surfaces organizer-written flags with a one-tap "keep / remove" affordance. (3) Voice candidate for the confirm surface: `"Dave saved this for you — keep it?"`. The principle opposes *unattributed* write-on-behalf. With attribution + member confirm, principle holds and the asymmetric-labor problem closes.
- **Cross-reference:** synthesis should pair this finding + Finding #1 (self-read-blocked) + Finding #2 (delivery confirmation) into a single "flag lifecycle UX" cluster for M4.

---

## Tally (from edge-attendee's wrap-up)

- **Ship-blocker for real trip: 3** — self-read of own flags (#1), heading microcopy (#8), organizer-write-on-behalf addendum (#10)
- **Nice-to-have: 5**
- **Out-of-scope: 2**
- **Total: 9 findings + 1 addendum**

**Master-principle verdict:** M4 holds "don't encode a default" at the schema level for all six structured-input surfaces (dress, activity, member-flag, address, datetime, airline — all retain freeform fallback or are physical-world entities, not user-state defaults). Where M4 fails is in the *affordances around* the principle's data: self-read of own flags blocked, no delivery confirmation, duplicate `skipping` surface, missing heading microcopy. The principle is sound; the last-mile UX is incomplete.

**Highest-leverage for this week:** self-read RLS + read-back UI on the flag picker. One CREATE POLICY plus a small re-render on `item-flag-form.tsx`. Closes the literal Priya §3 failure mode. Pairs naturally with the heading microcopy fix (`"Anything we should know?"` / `"Just for the organizer — private to you."`).
