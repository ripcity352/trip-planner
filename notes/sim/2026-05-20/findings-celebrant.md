# Celebrant findings (David) — M4 pressure-test sim
> Walked 2026-05-20 by `celebrant` teammate (persona-groom.md).
> Filed via SendMessage (subagent Write blocked by harness rule).
> Team-lead transcribed to file. Batch 2 (findings 9–15) pending.

### Finding: Hide-from-celebrant works as RLS-filter, not blur-gradient — settle the conflict
- **Scene:** T-7, scanning Saturday's itinerary on phone
- **Persona:** celebrant (David)
- **Today's reality:** `can_see_content()` RLS at SELECT filters the row server-side; celebrant gets back rows where `visibility != 'hide_from_celebrant'`. No client-side blur or shadow card. (`migrations/20260519123255_m1_foundation.sql:128–172`)
- **Guide says:** `ux-design-principles.md:51–73` describes a frosted-blur where celebrant sees the *slot* (time/category) but content is blurred. M4 DoD doesn't address the conflict.
- **Gap type:** spec
- **Severity:** nice-to-have
- **Where it lands:** decisions.md

### Finding: Celebrant has no "preview-as-celebrant" mode for organizer reassurance
- **Scene:** T-7, after realizing the organizer can't see what the celebrant view looks like
- **Persona:** celebrant (David) — failure mode lives in organizer
- **Today's reality:** No "view as celebrant" toggle. Organizer trusts the visibility flag or asks the celebrant to screenshot, which defeats the surprise.
- **Guide says:** Section 3 lists organizer affordances; preview-as-celebrant isn't one.
- **Gap type:** spec
- **Severity:** nice-to-have
- **Where it lands:** roadmap.md M5+

### Finding: `Athleisure` chip on dress code reads corporate at the celebrant's read surface
- **Scene:** T-7, Friday golf item card
- **Persona:** celebrant (David)
- **Today's reality:** Item card renders preset chip value verbatim. `Athleisure` is in the #163 preset set.
- **Guide says:** Section 5 already flags Athleisure as borderline-corporate.
- **Gap type:** voice
- **Severity:** nice-to-have
- **Where it lands:** new issue (microcopy rewrite — candidates: `Golf casual`, `Polo + shorts`, `Sneakers OK`; same pass re-checks `Cocktail`, `spa`)

### Finding: No first-login intake means defaults are organizer-set, not celebrant-anchored
- **Scene:** T-7, scanning the agenda and noticing the helicopter add-on
- **Persona:** celebrant (David)
- **Today's reality:** No 3-question vibe-tag intake on first login (`persona-groom.md:63`).
- **Guide says:** Section 2 — [UNSPECIFIED]. M4 DoD silent.
- **Gap type:** spec
- **Severity:** out-of-scope (for M4)
- **Where it lands:** roadmap.md M5+

### Finding: Vibe-tags don't appear on the M4 trip surface
- **Scene:** T-7, looking at the trip header for any vibe signal
- **Persona:** celebrant (David)
- **Today's reality:** CLAUDE.md rule #8 and persona doc treat vibe tags as first-class. M4 adds activity-tag chips on *items* (#164) but no `trip.vibe_tags`; no trip-level posture surfaced.
- **Guide says:** Section 5 cites rule #8 but doesn't surface vibe tags as an M4 deliverable.
- **Gap type:** schema
- **Severity:** out-of-scope
- **Where it lands:** roadmap.md M5+ (pair with first-login intake)

### Finding: No per-day RSVP grid on the celebrant dashboard
- **Scene:** Thursday, gate at SFO, checking who's around Thursday night
- **Persona:** celebrant (David)
- **Today's reality:** `trip_member_days` per-day RSVP exists in schema since M1; per-item RSVP exists from M3 (`migrations/20260520052357_m3_itinerary_announcements.sql:60–69`). No dashboard grid surface.
- **Guide says:** Section 2 mentions "weekend-at-a-glance" on now/next card but doesn't show a per-day grid.
- **Gap type:** UX
- **Severity:** nice-to-have
- **Where it lands:** roadmap.md M5+

### Finding: "Now/next" with no items in the next several hours reads dead
- **Scene:** Thursday 2pm, next item is 5h out, card shows single static row
- **Persona:** celebrant (David)
- **Today's reality:** `components/trip/now-next-card.tsx:77` — in-trip view shows now item + next item. Empty `now` with distant `next` = one static row.
- **Guide says:** Section 2 — single-answer-in-<1s glance; doesn't address empty-space state.
- **Gap type:** UX
- **Severity:** out-of-scope
- **Where it lands:** drop (empty space is the design)

### Finding: Celebrant has no audit-assurance that organizer-only flags were acted on
- **Scene:** Saturday 1pm chef-lunch — celebrant knows Marcus has a shellfish allergy, cannot see whether the organizer registered it
- **Persona:** celebrant (David)
- **Today's reality:** Member-flag SELECT RLS is organizer-only (`migrations/20260520052357_m3_itinerary_announcements.sql:494–512`). No aggregate signal like "3 flags considered" on celebrant view.
- **Guide says:** Section 4 confirms organizer-only flags; celebrant's read surface is implicitly "trust the organizer."
- **Gap type:** UX
- **Severity:** nice-to-have
- **Where it lands:** roadmap.md M5+ (risk: count-as-teaser; default position drop, escape hatch is texting organizer)

### Addendum (from DM exchange with organizer): RLS-filter holds persona but creates "noticeable gap" failure mode
- **Scene:** Dave DM'd asking which view I'd see for the Saturday gag-gift reveal
- **Persona:** celebrant (David) — surfaced via DM, not the scripted walk
- **Today's reality:** Filter-not-blur approach (M3-shipped) means the celebrant sees a literal time-gap on the itinerary. For a 30-minute surprise slot that's noise. For a multi-hour Saturday-evening reveal, the gap is conspicuous.
- **Guide says:** Silent on the time-gap secondary effect.
- **Gap type:** spec / UX trade-off
- **Severity:** nice-to-have
- **Where it lands:** decisions.md — couple with the blur-vs-filter ADR. **Worth documenting the decoy-item workaround as a pattern organizers can use:** organizer adds a `visibility=everyone` decoy item ("free time" / "recovery at the Airbnb") in the gap. Honest enough, no lie, fills the slot. Implication: when we write up "RLS-filter wins," the rationale should acknowledge this trade-off explicitly so future-Claude doesn't re-propose the blur on the basis of "celebrant notices the gap."

### Finding: `Cocktail` chip is ambiguous on a dress-code picker in bach-party context
- **Scene:** Saturday 6pm, dress-code chip on the downtown item
- **Persona:** celebrant (David)
- **Today's reality:** Issue #163 includes `Cocktail` as preset chip.
- **Guide says:** Section 5 already flags as questionable.
- **Gap type:** voice
- **Severity:** nice-to-have
- **Where it lands:** new issue — rename `Cocktail` → `Cocktail attire` or `Dressy`

### Finding: `Loud shirts` is the kind of microcopy the app should optimize toward
- **Scene:** Saturday 11pm, club item
- **Persona:** celebrant (David)
- **Today's reality:** `Loud shirts` in #163 preset set.
- **Guide says:** Section 2 — PASS on dinner-table voice test.
- **Gap type:** voice (positive — capture as pattern)
- **Severity:** out-of-scope
- **Where it lands:** drop (already shipped) — add one line to `notes/design-system.md` documenting the pattern: chip strings specific to social context, not generic fashion vocabulary

### Finding: No day-after thank-you flow — celebrant defaults to texting organizer directly
- **Scene:** Sunday morning, post-trip, wanting to thank everyone
- **Persona:** celebrant (David)
- **Today's reality:** No auto-draft, no photo wall, no recap card. App is functionally inert post-Sunday-breakfast.
- **Guide says:** Section 2 doesn't list this as M4. Group Recap deferred as umbrella.
- **Gap type:** spec
- **Severity:** out-of-scope
- **Where it lands:** roadmap.md M5+

### Finding: Departures aren't reflected on the arrivals manifest
- **Scene:** Sunday morning, manifest doesn't show Hugo's 9am flight back to LHR
- **Persona:** celebrant (David)
- **Today's reality:** Manifest is, per its name, *arrivals*. Return leg lives as itinerary transport item.
- **Guide says:** Section 4 covers Hugo's Friday arrival; departures not in M4 DoD.
- **Gap type:** UX
- **Severity:** out-of-scope
- **Where it lands:** roadmap.md M5+ (pair with "who's left in town")

### Finding: No silent-veto on itinerary items — celebrant cannot remove without confrontation
- **Scene:** Anytime an item the celebrant wishes wasn't there (helicopter add-on)
- **Persona:** celebrant (David)
- **Today's reality:** Organizer-write, member-read on `itinerary_items`. Celebrant can't remove. Only escape hatch is asking the organizer — exact friction from `persona-groom.md:38`.
- **Guide says:** Section 2 — [UNSPECIFIED].
- **Gap type:** spec
- **Severity:** out-of-scope
- **Where it lands:** roadmap.md M5+

### Finding: "Dave handle it" / co-organizer handoff doesn't exist as a UI affordance
- **Scene:** Hypothetical T-14 — work blew up, celebrant wants to mute the trip for a few days
- **Persona:** celebrant (David)
- **Today's reality:** Co-organizer role in schema since M2 (`decisions.md:1203–1218`). No UI to lateral powers + silence notifications.
- **Guide says:** Section 2 — [UNSPECIFIED]. M4 silent.
- **Gap type:** spec
- **Severity:** nice-to-have
- **Where it lands:** roadmap.md M5+ (partial substitute = OS-level mute per CLAUDE.md anti-pattern rule)

### Finding: Meet-the-crew with self-authored bios still missing
- **Scene:** T-7, scanning roster and realizing FIL's-friend Tom doesn't know anyone
- **Persona:** celebrant (David), failure mode lives in Tom and Tasha
- **Today's reality:** M3 roster ships names + numbers + vCard. No bios.
- **Guide says:** Section 2 + 4 — [UNSPECIFIED]. `killed-and-deferred.md` killed Crew Cards (#31) over "how-do-you-know-the-celebrant" framing; a *bare* bio column isn't killed.
- **Gap type:** spec
- **Severity:** nice-to-have
- **Where it lands:** roadmap.md M5+ — file as "bare bio column, no relational framing, optional" per `killed-and-deferred.md:29` revival criteria. Do not re-propose Crew Cards.

### Finding: Hard-banned-pattern audit on M4 — chip pickers don't drift toward "complete your profile" energy
- **Scene:** T-7, first paint of the dashboard, scanning for any completion-score / progress-bar / "complete your profile" copy
- **Persona:** celebrant (David)
- **Today's reality:** Per CLAUDE.md "What NOT to do" + `killed-and-deferred.md:43–44`, none of these patterns ship. Guide section 5 confirms.
- **Guide says:** Section 5 — PASSES.
- **Gap type:** voice (positive audit)
- **Severity:** out-of-scope
- **Where it lands:** drop (already enforced) — but the new chip pickers in M4 are the highest-risk vector for future drift (e.g. a "missing dress code? add one!" toast would violate the spirit). M4 PR-template microcopy gate already covers this. No action needed; capture as audit-passed.

---

## Tally (from celebrant's wrap-up)

- **Ship-blocker for real trip: 0**
- **Nice-to-have: 9**
- **Out-of-scope: 6** (5 + 1 positive-audit)
- **Total: 15 findings + 1 addendum (RLS-filter noticeable-gap workaround)**

**Highest-leverage for this week:** Settle the blur-gradient-vs-RLS-filter spec conflict in `decisions.md` (paired with the decoy-item workaround pattern from the addendum). Walking through Saturday's surprise scene, the filter-not-blur pattern is what actually delivers the persona promise. The blur would have *broken* the moment — a frosted 9pm card with `Saturday 9pm · Activity` metadata visible is a teaser by another name, and David would have started guessing. Filter wins; just write it down.

**DMs sent:**
- → organizer (Dave): re: gag-gift visibility shape + preview-as-celebrant gap
- → edge-attendee (Marcus): re: self-read of own flags + peer-side signal that organizer acted
