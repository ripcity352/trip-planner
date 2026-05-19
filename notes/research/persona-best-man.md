# Persona — The Best Man (Organizer)

> Source: persona-research subagent, 2026-05-18.
> First-person voice. Use this to pressure-test features for organizer-side UX.

## Profile

- 33yo, finance, organized but stressed
- 2 months into planning his college roommate's bachelor trip
- Has: spreadsheet, separate group chat without the groom, folder of Venmo screenshots
- Has fronted ~$3,047 of personal cash; growing resentment that nobody else is helping
- Two attendees still haven't RSVP'd

---

## The top 3 things he'd offload tomorrow

1. **The 11pm Tuesday "yo what's the total again" text from Brad.** Currently: open spreadsheet, recompute (Danny added himself to chef dinner but not paintball), respond with a number 70% sure of.
   → **Want:** a live per-person running total each guy can pull up himself. Not a "view dashboard" — a number with *his name on it*, glanceable.

2. **The RSVP nag.** Mike and Kevin still haven't confirmed in 3 weeks. A third ask reads as nagging; a system-generated *"Mike, the Airbnb deposit goes non-refundable in 4 days, are you in?"* reads as logistics.
   → **Want:** outsource the social cost of asking. Cliff-date-aware nudges from the app, not from him.

3. **The airport pickup / lodging question, repeated.** Brad has asked when we land four times. Tyler asked yesterday what the Airbnb address is. Info exists in his head and a pinned message nobody reads.
   → **Want:** a single "what's happening right now / next" screen. Linkable. Always-current.

## What he does NOT trust the app with

- **Money movement** — no auto-Venmo on his behalf (one wrong push to the groom's dad and he's done). Show math, draft request, *let him hit send*.
- **Anything the groom can see** — preview before it goes live to the groom
- **Final headcount lock** — he clicks that himself
- He'll keep a shadow Google Sheet for at least the first trip on principle

## Relationship with the groom

| Groom knows | Groom does NOT know |
|---|---|
| Dates, city, that there's golf | The strip-club debate (resolved: no) |
| | The real cost (~$850, he thinks ~$600) |
| | That groom's BIL Greg almost wasn't invited |

**What organizer wants to ask the groom without asking:**
- Does Danny actually want the cigar lounge or is he saying yes to be nice?
- Anyone on the list he *secretly* doesn't want there?
- Is the fiancée OK with the budget? (If not, he cancels 3 days out, organizer eats deposits.)

**What organizer wants to telegraph (not say):**
- "Budget is what it is, please don't suggest add-ons." Wants groom to *see the spend* without ever sending a number.

## The drop-out math (worked example)

Kevin bails 3 weeks out. Airbnb non-refundable. Chef deposit gone. Golf cancelable 72hr. Paintball not cancelable.
- Kevin's share: $850. Recoverable: ~$180.
- $670 either eats into organizer's pocket OR redistributes across 7 guys at ~$96 each.
- Now organizer has to text 7 grown men "Kevin bailed, you owe another $100."
- 3 pay immediately. 2 complain. 1 ghosts a week. 1 asks if his paintball slot can be cut (it can't, it's per-group).

**App helps:**
- Surfaces non-refundable cliff dates BEFORE people bail
- Redistributes the shortfall automatically (math, not money movement)
- Drafts the awkward message so it's "from the app," not from him

**App HURTS:**
- If it auto-charges — Kevin disputes, organizer in support hell
- If it makes bailing one-click easy — more people bail

## Asymmetric labor problem (key UX insight)

> The other guys won't "claim tasks." They will vote on two options I put in front of them. They will react with an emoji. They will throw out a restaurant name if I ask. **The unit of contribution is 10 seconds, not 10 minutes.**

→ Polls with deadlines. Tiny "your turn" prompts. Don't make Tyler fill out a form — make him pick between two photos of an Airbnb.

## Reimbursement nightmare (worked example)

- Airbnb on Amex: $2,200
- Golf on Chase: $480
- Paintball on Amex: $560
- Chef on debit: $800 deposit + $600 balance day-of
- 3 dinner deposits on Chase: $450
- Different cards for points optimization

**What he wants:** the app KNOWS he paid X, headcount is 8, your share is Y, *here's a single Venmo deep link pre-filled*. **ONE link per person, not one per expense.**

**Escalation policy for non-payers:**
- Nudge at 7 days
- Firmer at 14
- At 21, surfaces to the group as "outstanding" (Mike still hasn't paid for Feb planning dinner)

## Co-organizer dynamics

> Greg is "helping." Booked paintball, took a week to send receipt, booked the wrong day, we fixed it. I love Greg.

→ Co-organizer should have:
- **Spend authority cap** (e.g., $200)
- **Full visibility** into everything
- Airbnb-level decisions still route through primary organizer

## Three things that make the organizer feel respected

1. **"Front" badge / running tally** showing he's personally floated $3,047 — visible to the group without him bringing it up
2. **Organizer's view** with the awkward stuff (who hasn't paid, who hasn't RSVP'd, deposit cliffs) — texts him when something needs attention, **one digest not 14 pings**
3. **End-of-trip one-screen summary** he can screenshot for the groom: "Here's what your bach weekend looked like." Not for credit. *Okay, partially for credit.*

---

## Design implications

- **Per-person live total** glanceable from anywhere — not buried in a "dashboard"
- **Cliff-date-aware automated nudges** for RSVP and payment — system-as-shield for the awkwardness
- **"What's next" home-screen card** is the always-current source of truth (replaces pinned messages)
- **Draft, don't send** for any money-adjacent action — preview + manual confirm
- **Asymmetric authority for co-organizers** — first-class spend cap as a permission
- **Front-amount visibility as a status, not a complaint** — passive surface, not a "click here to remind everyone"
- **Single-Venmo-link-per-person** for settlement, not per-expense
- **3-tier nudge escalation** (7/14/21 days) with the final tier visible to the group
- **Digest cadence over per-event pings** — daily organizer briefing
- **Trip-recap screenshot** as a first-class export, day after the trip
