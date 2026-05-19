# Personas — Edge-case Attendees

> Source: persona-research subagent, 2026-05-18.
> Six first-person rants from attendees whose dynamics get glossed over by default-attendee UX.
> Use this to pressure-test inclusion of non-typical attendees.

---

## Master design principle (across all six)

> **Default attendees opt *into* exceptions. Non-default attendees should opt *into* participation, not have to opt out of assumptions.**

The failure mode is the same across every persona: the app or group assumes a uniform attendee — fully-funded, fully-available, fully-acculturated, fully-typical-diet, drinking, present-for-all-days, of-the-tribe — and forces anyone who diverges to *self-identify the divergence*, usually in front of the group.

**The fix isn't six special-case features.** It's making the data structures granular by default — per-item RSVP, per-item cost, per-item dietary check, per-item dress code, per-day attendance, per-add-on opt-in — so *every* attendee is configuring their own trip from neutral primitives. The broke friend isn't using a "broke mode" — he's checking different boxes on the same form everyone else fills out.

**That's how you handle non-default attendees gracefully: by refusing to encode a default at all.**

---

## 1. The Broke Friend — Marcus, 31, recently laid off

> "Everyone's splitting the chef evenly, even though I'd happily eat a Subway sandwich. Everyone assumes I'm in on the helicopter add-on. I'm not going to ask for a discount — that's humiliating. I want to know upfront the *non-negotiable* number versus the 'whales' tier. And I want to opt out of the chef silently, not in front of the group."

**Helps:**
- Itemized cost breakdown with **opt-in** line items (not opt-out)
- Private "your share" view (no leaderboard of who's in on what)
- Tiered participation defaults in itinerary — every activity has a `skip` option that requires no conversation
- Money pool (Goal 6.5) defaults to **itemized, not equal-split**

**Hurts:**
- Any visible "budget mode" toggle. Don't label him.
- "X people opted in" counters next to add-ons — creates social pressure
- A "request discount" button — the whole point is he doesn't want to ask

---

## 2. The Sober Attendee — Devin, 34, 2 years sober

> "I want there to be a single hour of the day that isn't structured around alcohol. And I want to be able to leave the club at midnight without it being A Whole Thing where someone walks me out and announces it."

**Helps:**
- **Daily structure with non-alcohol anchors** — itinerary builder nudges organizer: "you have 4 bar-tagged events today and 0 non-bar. Want to add a daytime activity?"
- **Activity tags** (`bar` / `club` / `meal` / `outdoor` / `gaming` / `chill`) so balance is auditable
- **Silent "I'm heading back" button** — pings only the organizer, no group announcement
- **Per-item RSVP** (not just per-day) — opt out of the 1am club leg without explaining

**Hurts:**
- A "sober" flag on profile. Even private-to-organizers makes him *The Sober One*
- Mocktail menus surfaced specifically to him. Patronizing
- "Support buddy" pairing feature. He's an adult.

---

## 3. The Dietary Restriction — Priya, 29, celiac

> "Every group trip, someone picks a restaurant, I open the menu in the Uber, and it's a pasta place. Then I'm the one who has to say something, and now I'm 'high-maintenance Priya.' I want the constraint attached to the *trip*, not to me asking again every group chat."

**Helps:**
- **Dietary notes surfaced at the itinerary-add step**, not buried on a profile. When organizer adds a restaurant, show: *"3 attendees have dietary notes — Priya: celiac, Jake: shellfish, Sam: vegetarian"*
- **Restaurant link → menu link field** with "menu reviewed by [name]" check
- **Pre-trip checklist for organizers** — did you confirm each restaurant works? Y/N per stop
- **"I can't eat here" private flag per itinerary item** — organizer sees before the meal, not at the table

**Hurts:**
- Allergy alert pinging the whole group every restaurant add (broadcasts her)
- "Special meals" section in itinerary (segregation)
- Asking her to "approve" each restaurant (same labor, just in-app)

---

## 4. The Long-Distance / Late Arrival — Hugo, 33, flying from London

> "I land Friday at 4pm local, leave Sunday at 9am — Monday meeting non-negotiable. I miss the Thursday kickoff dinner, fine. But I'm charged a full equal share of the four-night Airbnb and the welcome dinner I wasn't at. Nobody's being a jerk — they just *forgot* I'm not on the same arc."

**Helps:**
- **Per-day attendance prorates the money pool automatically** — don't make Hugo ask
- **"You're missing this" digest** — late arrivals get a summary of what was decided/eaten/posted before they landed
- **Time-zone-aware itinerary** — show local time alongside trip time
- **Arrival/departure logistics field** per member so organizer doesn't schedule welcome dinner before everyone lands

**Hurts:**
- Public "% of trip attended" stat on profile
- Requiring justification of late arrival in a comment thread
- "Partial attendee discount request" workflow requiring approval — should be automatic from per-day data

---

## 5. The Partner's Friend / "+1 Bridge" — Tasha, 30, bride's best friend

> "I know two people. The rest are the groom's college buddies quoting some night in Cabo I wasn't at. I don't know if breakfast is casual or if I should dress up. I've been calling someone 'Brian' for two days and I'm 90% sure it's 'Ryan.'"

**Helps:**
- **Member directory with photos + one-line bio** — *"Ryan — groom's college roommate, lives in Austin, was at Cabo"*. Low-stakes pre-trip browsing
- **Per-event "what to wear" field** on itinerary items — organizer fills once, kills 100 anxious DMs
- Optional **"how do you know the group of honor"** field — connections visible, +1s can find each other
- **Pre-trip icebreaker prompts** in announcements (opt-in) — gives outsiders an on-ramp

**Hurts:**
- "Newcomer" or "+1" badge — now she's officially The Outsider
- Mandatory intro post on arrival
- Algorithmic pairing with another +1 (patronizing)

---

## 6. The Cousin / Family Attendee — Liam, 24, groom's younger brother

> "His friends are 32, software engineers and finance guys, make 4× what I do. They booked a $1,200/night house and everyone shrugged. I can't keep up at dinner, can't keep up at the bar, definitely can't keep up at the strip club with the $400 minimum. I want to be there. I don't want to be the kid brother getting comped."

**Helps:**
- Itemized cost structure (same as Broke Friend)
- Activity vibe tagging so he can preview Saturday afternoon (golf = skip, pool = in)
- **Anonymous "comfort check" pulse** the organizer can send: "rate this trip's cost comfort 1–5" — surfaces problems without anyone raising a hand
- Per-event opt-out without explanation
- **Silent sponsorship/comping flow** — if the groom wants to cover his brother's share, it happens in the money pool with no public "Liam: comped" line item

**Hurts:**
- "Junior member" or "family" tag
- Surfacing salary or budget tier anywhere
- "Request to be comped" button (same humiliation as broke friend)
- Polls where everyone sees he voted "out" on the expensive thing

---

## Design implications for the roadmap

Key gaps vs. existing roadmap:

1. **Goal 2** has dietary + per-day + RSVP — but profile-level, not surfaced at the itinerary-add step where organizers need them
2. **Goal 5 (itinerary)** needs: activity tags (`bar`/`meal`/`outdoor`/`chill`), **per-event RSVP**, **dress code field**, menu link with dietary review
3. **Goal 6.5 (money pool)** is currently flat-per-attendee → needs **itemized line items with opt-in** + **proration by days attended**
4. **No current goal** addresses: member directory with bios, "what you missed" digest for late arrivals, anonymous comfort-pulse polls, silent opt-out from individual events, silent sponsorship/comping

**Cross-cutting:** per-item visibility, per-item RSVP, per-item cost-opt-in are all data primitives. These connect directly to the visibility primitive flagged in `audit-round-2.md` #2 — same shape, different content type.
