# Persona — The Groom (Celebrant)

> Source: persona-research subagent, 2026-05-18.
> First-person voice. Use this to pressure-test features for celebrant-side UX.

## Profile

- 32yo software engineer being celebrated
- ~10 close friends scattered across 4 cities
- Best man = college roommate ("enthusiastic but disorganized")
- Deep in wedding planning; nervous about cost to friends, being a cliché, embarrassment, fiancée's reaction

---

## "Oh thank god this exists"

- **Per-day RSVP grid** — Pete only Fri-Sat, Marcus arrives Thursday night, Jordan won't commit until wife's work clears. Currently lives across 4 DMs in his head. Just *showing* it without asking is a real exhale.
- **Self-served dietary/sober field on profiles.** Friend Ben got sober 8 months ago. If Ben can quietly mark "sober" and the organizer sees it without the groom having to send the "hey heads up about Ben" text — that's a gift.
- **Shareable invite link with strong OG card.** Best man will text it with zero context and it still looks legit. *That's the bar.*

## "Cringe / close the tab"

- "Days until the BIG DAY 🍻" countdown banner
- Default copy referring to "the groom" in third person — *I have a name*
- Penis emoji or penis-shaped anything
- 5-star rating on individual peoples' suggested activities (Pete sees his karaoke idea got 2 stars from Marcus)
- "Bachelor party packing list" with novelty items pre-checked
- Leaderboards of any kind (especially "fastest RSVP")
- Anything that looks like a Vegas pool-party promoter designed it

## What the groom wants CONTROL over

- **Dates + city** (organizer proposes, groom confirms — non-negotiable)
- **Guest list approvals** (don't let best man add his coworker Greg as a +1; courtesy invite of FIL's friend Tom needs to be respected)
- **Budget ceiling per person** — hard cap the app enforces on the money pool ("$600 all-in, full stop")
- **Vibe tags** on the trip (`chill`, `outdoors`, `no strippers`) — soft constraints, visible to everyone, used as defaults for activity suggestions
- **Veto on itinerary items** — quiet "remove" that does NOT notify the proposer with a sad-face emoji

## What the groom wants HIDDEN FROM him

- The gag gift / roast slideshow / jersey the best man is coordinating — `groom-hidden` flag, with NO "🔒 1 hidden item" teaser. Just gone from his view.
- Per-person cost breakdown beyond his set ceiling (don't tell him Marcus paid $580 and Jordan paid $340)
- Who voted no on which date (aggregate counts only on his view)
- Surprise activities — show as blocked-off time window, not content

## Roles the groom doesn't want but currently can't escape

- **Tiebreaker on everything.** Wants a "best man decides" toggle per decision so Dave can just decide (karaoke vs. comedy club is not the groom's call)
- **Chasing payment** — money pool DMs people, not the groom
- **Explaining the trip to invitees who don't know each other** — a "meet the crew" page with self-authored one-line bios so FIL's friend Tom doesn't show up not knowing anyone
- **Group-chat MC** — realtime announcements from organizer + email digest = stops being the forwarding service

## Fears

- **Domino-bail:** Pete bails for "work" 3 weeks out, Marcus quietly bails the next day. App should NOT publicly broadcast a single declined RSVP — going-pings-group, declined-is-silent-and-organizer-only
- Best man putting $4,200 villa deposit on his card and it being weird forever
- The "we got the groom a stripper" energy from one friend (Mike, it's always Mike) overriding the room. **Vibe tags need teeth** — `no strippers` lets attendees flag a proposed activity *anonymously* without anyone being the one who said no
- Someone (Mike) putting it on Instagram with fiancée tagged
- Older or younger attendees feeling like chaperones / kids all weekend

## Three micro-features that would make the groom smile

1. **"What does the groom actually want?" private intake** on first login — 3 questions, 2 min, never shown to anyone, feeds defaults into vibe tags + activity filtering. "Yes to hiking, no to clubs, hard no to anything with the word 'shenanigans.'"
2. **"I'm overwhelmed, Dave handle it" button** — transfers organizer powers to co-organizer for 7 days, silences groom's notifications, reversible, no drama
3. **"Thanks for coming" auto-draft** — day after the trip, pre-filled messages to each attendee with one photo from the shared wall they're in, one tap each to send

---

## Design implications

- The **`groom-hidden` visibility flag** must be invisible-to-the-groom, not just access-controlled — no "1 hidden item" teaser
- **Going broadcasts; declining whispers.** RSVP state changes have asymmetric notification policy
- **Vibe tags are first-class** — soft constraint mechanism, not just metadata
- **Veto/remove must be silent** — does not notify the proposer
- **Money UI hides identity below the ceiling** — show ceiling enforcement and "you owe X", but not who-paid-what-individually to the groom
- **"Meet the crew" mini-page** with self-authored one-line bios — solves the cross-friend-group anxiety
- **Day-after thank-you flow** — light automation with full editorial control
