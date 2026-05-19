# Integration Feasibility — APIs, Auth Models, Verdicts

> Source: integration-engineer subagent, 2026-05-18.
> Several prior assumptions invalidated by this research — flagged inline.

---

## Summary Table

| # | Service | Verdict | Cost / Approval | Headline Risk |
|---|---|---|---|---|
| 1 | Splitwise | **LINK-OUT + optional IMPORT** | Free API; user needs paid Pro for >3 expenses/day | Free-tier cap kills bulk write UX |
| 2 | Stripe Connect (Standard) | **INTEGRATE (deposits) — NOT escrow** | 2.9% + 30¢; Express +$2/mo + 0.25% payout | No true escrow; only delayed payout (≤90d) |
| 3 | Google Photos | **LINK-OUT only** (downgraded from prior assumption) | Free | **Sharing API killed Mar 2025**; can only see app-created albums |
| 4 | ICS Calendar Export | **INTEGRATE (build ourselves)** | Free | Refresh latency 1–24h on consumer clients |
| 5 | iOS Contacts (vCard) | **INTEGRATE (vCard download)** | Free | Group chat deep-link not possible |
| 6 | Resy / OpenTable / Tock | **LINK-OUT** | Partner approval, B2B sales | **Resy + Tock merging 2026**; no public API |
| 7 | Apple/Google Wallet | **INTEGRATE (Phase 2)** | Apple $99/yr; Google free | Cert mgmt + 398-day rotation |
| 8 | Spotify Playlists | **INTEGRATE (dev mode only)** | Free | **Extended quota = orgs-only since May 2025** |
| 9 | what3words | **LINK-OUT or skip — use Plus Codes** | Free trial; paid for prod | Google Plus Codes is free + native to Maps |
| 10 | Twilio SMS | **DON'T BOTHER (MVP)** | A2P 10DLC: $19 reg + $0.003/msg + $4/mo | Carrier registration overhead vs email |
| 11 | Airbnb / Vrbo | **DON'T BOTHER** | Closed partner program | Effectively unreachable for our scale |
| 12 | Uber / Lyft | **LINK-OUT (deep links)** | Free | No group-ride primitive; one rider per link |
| 13 | Eventbrite | **LINK-OUT** | Free API (500 req/day) | No order/purchase endpoint — read-only |
| Bonus | TripIt | **IMPORT (email forwarding)** | Free | No public API write; v1 docs frozen |
| Bonus | Wise | **DON'T BOTHER** | Enterprise sales onboarding | Built for banks/payroll |
| Bonus | Resend / PostHog / Sentry | **INTEGRATE (infra)** | Free tiers ample | None |
| Bonus | Mapbox / Google Static Maps | **INTEGRATE** | Generous free tiers | Lock-in to one provider |
| Bonus | Anthropic / OpenAI extraction | **INTEGRATE (small)** | Pay-per-token | Reliability of structured extraction |
| Bonus | Plaid | **DEFER** | Significant compliance | Money-movement product, not a fit yet |

---

## Tier 1 — Strong Leads

### 1. Splitwise — LINK-OUT + optional IMPORT

OAuth 1.0a and OAuth 2.0 at `https://secure.splitwise.com/api/v3.0`. `POST /create_group` (with `group_type: "trip"`) + `POST /create_expense` with per-user `paid_share` / `owed_share` arrays does what we want — custom shares excluding the celebrant is trivial.

**Killer gotcha (2024 change):** Splitwise imposed a **3-expenses-per-day cap on free users**, with a 10-second cooldown and ads. Any "create expense in Splitwise from our app" flow burns the user's daily quota and looks broken.

- Rate limits otherwise undocumented ("conservative ... subject to change at any time" — email `developers@splitwise.com`)
- Recommend: **deep-link prefill** (organizer taps "save" in Splitwise themselves), OR **one-way read** of balances for display

Docs: [dev.splitwise.com](https://dev.splitwise.com/), [free-tier limits](https://splittyapp.com/learn/splitwise-free-limits/)

### 2. Stripe Connect — INTEGRATE, but not as escrow

**Stripe does NOT offer escrow accounts.** The escrow-shaped behavior available: charge → hold in platform balance → **delayed payout ≤90 days** (Custom/Express only). For a bachelor party, trip-date-minus-payout-date is usually <90d → works.

- **Standard Connect** if the organizer has their own Stripe account — zero extra fees on top of 2.9% + 30¢. Organizer takes liability, we facilitate.
- **Express** if we onboard the organizer ourselves — $2/mo per active account + 0.25% + $0.25 per payout
- **Custom** = overkill

**Recommendation:** Standard. Refund logic (partial refund per cancellation policy) is application-level; Stripe just executes `amount` we pass to `refunds.create`.

Docs: [connect/manual-payouts](https://docs.stripe.com/connect/manual-payouts), [escrow Q&A](https://www.quora.com/Does-Stripe-Connect-offer-an-escrow-account)

### 3. Google Photos — LINK-OUT only (verdict DOWNGRADED)

**Prior assumption was wrong.** As of **March 31, 2025**, Google removed `photoslibrary`, `photoslibrary.readonly`, and `photoslibrary.sharing` scopes. The `share`, `unshare`, `join`, `leave` endpoints on `sharedAlbums` now return `403 PERMISSION_DENIED`.

- We can technically upload via `photoslibrary.appendonly` + create an album, but **only our app can see those albums** — non-Google users can't join; we can't programmatically share with a roster
- The replacement Picker API (`photospicker.mediaitems.readonly`) is for users selecting *their own* photos to share into our app — opposite direction
- **Recommendation:** organizer creates a shared album in Google Photos app, pastes link into trip; we render a tile. OR use **Supabase Storage for first-party photo sharing** (mobile-first, no Google account required)

Docs: [Updates to Photos APIs](https://developers.google.com/photos/support/updates), [Picker API](https://developers.google.com/photos/picker/guides/get-started-picker)

### 4. ICS Calendar Export — INTEGRATE (DIY)

No third-party API needed. Generate `text/calendar; charset=utf-8` server-side.

**Best architecture:** signed, opaque per-attendee URL (`/api/ics/<jwt-token>.ics`) so each attendee gets only items they've RSVP'd `yes` to.

- Serve as `webcal://` link for subscription UX (iOS Calendar + Google Calendar both intercept it). Same URL must respond to plain `https://`
- **Gotchas:**
  - Always emit `VTIMEZONE` blocks or UTC — never floating times
  - Consumer clients refresh every few hours to a day (Google Calendar / iCloud) — don't expect realtime; surface a "force refresh" note for last-minute changes
  - Stable `UID` per event so updates don't duplicate
- One-shot `.ics` downloads also fine for per-item "add to calendar"

Refs: [ICS integration guide](https://www.calen.events/blog/ics-file-calendar-integration-guide), [Simon Willison webcal](https://til.simonwillison.net/ics/google-calendar-ics-subscribe-link)

---

## Tier 2 — User-Requested

### 5. iOS Contacts mass-import — INTEGRATE (vCard download)

Partial answer to the "mass-download contacts + create iMessage group" idea.

- Generate **single multi-contact `.vcf`** (vCard **3.0** for iOS compat), serve as download
- **iOS Safari → Mail attachment flow shows "Add All N Contacts" button** → bulk import works
- **No public iOS API for "add to a contact group" from web** — group assignment is done by the user in Contacts app post-import
- **Keep .vcf ≤200 contacts per file** (Apple's documented practical limit) — trivial for a 12-person party

**iMessage group chat deep-link does NOT exist:**
- `sms:` and `imessage:` URL schemes accept a single recipient + optional `body=`
- **No documented multi-recipient or group-creation scheme**
- Fallback: "Copy all numbers" button → user pastes into a new Messages thread

Sources: [Apple SMS URL scheme](https://developer.apple.com/library/archive/featuredarticles/iPhoneURLScheme_Reference/SMSLinks/SMSLinks.html), [macReports vCard import](https://macreports.com/how-to-import-a-vcard-vcf-file-into-iphone-contacts/)

### 6. Resy / OpenTable / Tock — LINK-OUT (partner sales cycle risk)

**Resy and Tock are merging in summer 2026** under Resy. Anything built against either today is at risk.

**OpenTable** has a Partner API behind [opentable.com/restaurant-solutions/api-partners](https://www.opentable.com/restaurant-solutions/api-partners/) — **B2B sales cycle, not self-serve dev portal**. API is restaurant-management focused; no public consumer-side "book a 12-top."

**Recommendation:** for itinerary items of type "dinner," store venue + reservation deep-link the organizer pastes. Do NOT promise a "reservation integration" on the roadmap.

Source: [Resy-Tock merger](https://www.restaurantbusinessonline.com/technology/reservation-services-resy-tock-are-merging)

### 7. Apple/Google Wallet — INTEGRATE (Phase 2)

**Apple Wallet:**
- $99/yr Apple Developer membership + Pass Type ID cert + WWDR intermediate cert
- Build `pass.json` → ZIP → PKCS#7-sign → serve as `.pkpass` with MIME `application/vnd.apple.pkpass`
- **Cert expires every 398 days — operational chore**

**Google Wallet:**
- Free; create Issuer account on Google Pay & Wallet Console
- Passes issued via **signed JWT** containing class+object, surfaced through "Add to Google Wallet" link
- New issuer accounts start in **demo mode** — production access requires review

**Verdict:** Generic pass with trip name, dates, lodging address, barcode → trip URL. Fantastic UX hook but should land *after* core trip dashboard.

Sources: [Apple Wallet identifiers](https://developer.apple.com/help/account/capabilities/create-wallet-identifiers-and-certificates/), [Google Wallet JWT](https://developers.google.com/wallet/tickets/events/use-cases/jwt)

### 8. Spotify Collaborative Playlists — INTEGRATE (dev mode only, can't scale)

OAuth scopes `playlist-modify-private` + `playlist-modify-public` + `playlist-read-collaborative`. Create with `collaborative: true, public: false`; anyone with link can add/remove tracks.

**Critical 2025 change:** Spotify restricted **Extended Quota Mode applications to organizations only (not individuals) as of May 15, 2025**. New apps stay in dev mode capped at **25 named test users**.

- For "build it for ourselves + 12 buddies" MVP, dev mode is fine
- A public launch needs an LLC (or similar) and approved partner application
- Each attendee must complete a Spotify OAuth and be added to our app's allowlist

**Recommendation:** ship as opt-in "if your trip has ≤25 people and you'd like to authorize Spotify..."; consider it a marketing-only feature until extended access granted.

Sources: [Extended access criteria](https://developer.spotify.com/blog/2025-04-15-updating-the-criteria-for-web-api-extended-access), [scopes](https://developer.spotify.com/documentation/web-api/concepts/scopes)

### 9. what3words — SKIP, use Plus Codes

- Pricing tiers from £0 (limited trial) → £235+/mo, charged per coordinate conversion
- Rendering pegged to their API

**Google Plus Codes** (e.g., `849VCWC8+R9`) are free, decoded natively in Google Maps + Apple Maps, work offline, 14m × 14m precision — same use case, zero vendor lock-in.

**Recommendation:** Plus Codes via [Open Location Code](https://github.com/google/open-location-code) lib for "precise meet point" pins.

Source: [what3words pricing](https://accounts.what3words.com/select-plan)

---

## Tier 3 — Confirmations

### 10. iMessage / WhatsApp / SMS — DON'T BOTHER (MVP)

Confirmed:
- **No programmatic iMessage send** for third parties
- WhatsApp Business API is approval-gated, template-only, days of approval
- Twilio is the only sane outbound-SMS path, but **A2P 10DLC US registration** is mandatory: ~$19 one-time + ~$4/mo per campaign + $0.003/msg + carrier fees
- Group MMS to >10 recipients filtered aggressively

**For magic-link auth + "trip created" pings, email beats SMS in 2026** (Resend $0/mo for 3k emails). Defer SMS until users ask.

Sources: [Twilio A2P 10DLC](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc), [SMS pricing](https://www.twilio.com/en-us/sms/pricing/us)

### 11. Airbnb / Vrbo — DON'T BOTHER

- Airbnb Partner API closed to unsolicited applications
- Recruit partners directly, evaluate on profitability + infra, require NDA + security review + 6-month feature compliance
- No consumer-facing "fetch listing metadata" endpoint
- Scraping violates ToS

**Recommendation:** organizer pastes listing URL into a "Lodging" itinerary item; render URL as card. Generic OpenGraph scraper with caching if previews wanted later.

Source: [Airbnb API ToS](https://www.airbnb.com/help/article/3418)

### 12. Uber / Lyft — LINK-OUT (deep links)

Both offer **universal deep links** with pre-set pickup + drop-off + product. Free, no approval beyond a Client ID for affiliate attribution.

- **No "group ride" or "ride for N people" primitive** — each attendee gets own link
- Use case: itinerary item of type `ride`, each attendee gets one tap "Get Uber to {venue}"
- Lyft universal links fall back to web for non-app users
- **Don't promise carpooling** — Uber Pool wound down in most US markets

Sources: [Uber deep links](https://developer.uber.com/products/ride-requests-deeplink), [Lyft universal links](https://developer.lyft.com/docs/universal-links)

### 13. Eventbrite / Posh / Dice — LINK-OUT

- Eventbrite has free OAuth 2.0 API (500 req/day free) but docs explicit: **"Eventbrite does not offer the ability to purchase tickets or place orders via their API"**
- Posh + Dice have no public APIs

**Recommendation:** ticketed activities = any other URL itinerary item. Eventbrite read API useful for event metadata previews (title/date/price) for that one provider; OpenGraph scraping otherwise.

Source: [Eventbrite API intro](https://www.eventbrite.com/platform/docs/introduction)

---

## Bonus Picks

### TripIt — IMPORT via email forwarding
Users forward booking confirmations to `plans@tripit.com` (or use Inbox Sync); v1 API exposes read endpoints. **Idea:** per-trip forwarding alias (e.g., `trip-<id>@trips.ourdomain.com`) parses flight/hotel confirmations via [TravelSpec](https://travelspec.com) OR Resend inbound webhook + LLM extractor. Cheaper + more reliable than scraping airline emails. Source: [TripIt Inbox Sync](https://www.tripit.com/web/blog/news-culture/automate-your-tripit-itineraries-inbox-sync)

### Wise — DON'T BOTHER
Wise Platform sold to banks + enterprise payroll; onboarding via sales team that provisions sandbox+prod manually. Not a fit. Use Stripe Connect for FX. Source: [docs.wise.com](https://docs.wise.com/)

### Infrastructure picks (boring, recommended)
- **Resend** — transactional email (magic links, RSVP pings). 3k emails/month free, $20/mo for 50k
- **PostHog** — product analytics + session replay + flags. 1M events/month free. (Audit-round-2 recommends deferring to post-Goal-8; integrations agent thinks it's free enough now.)
- **Sentry** — error monitoring. 5k errors/month free
- **Vercel Analytics** — implicit in our stack

### Worth surfacing
- **Mapbox or Google Maps Static API** — static lodging/venue map tiles in itinerary cards. Google Static ~$2/1k after free quota; Mapbox more generous free
- **OpenAI / Anthropic for "TripGPT" extraction** — paste forwarded reservation email or screenshot → structured itinerary item. Cheap, high-value, low integration risk
- **Plaid for splitting bills from a real bank account** — only relevant for *settle* balances (vs Splitwise's "track who owes whom"). Significant compliance overhead; defer

---

## Roadmap-Ready Recommendations

| Phase | Items |
|---|---|
| **Now (free, no partner approval)** | ICS export, vCard download, Stripe Connect Standard for deposits, Resend, PostHog, Sentry |
| **Phase 2** | Wallet passes (Apple + Google), Splitwise deep-link prefill, Uber/Lyft deep links, AI itinerary extraction |
| **Defer (needs approval/scale)** | Spotify (needs org + extended access), full reservation booking (no API), Airbnb metadata |
| **Hard no** | what3words (Plus Codes wins), Wise, Twilio SMS at MVP, escrow expectations on Stripe |

---

## Implications for the roadmap

1. **Goal 7 photo wall:** must use **Supabase Storage**, not Google Photos shared albums. Google Photos = link-out only. Bumps schema/storage planning.
2. **Goal 6.5 money pool:** Stripe Connect is feasible for *deposits* but **language must say "delayed payout," not "escrow"** — legal/marketing precision matters
3. **Splitwise integration:** demote from "deep integrate" to "deep-link prefill" — protect free-tier users
4. **NEW Goal item: vCard contact export.** Self-service from the trip dashboard. Mass-import to iPhone Contacts in ≤3 taps. *(User-requested feature, feasible.)*
5. **NEW Goal item: "Copy all numbers to start a Messages thread"** — partial solve for the user's groupchat request. Documented as "the best you can do" given Apple's URL schemes
6. **Generic OG-scraper service** for lodging/restaurant link cards — small, broadly useful, replaces 3-4 wished-for integrations
7. **Resy/OpenTable: DO NOT promise integration on roadmap.** Link-out only
8. **Spotify: scope as "for tester trips only" or skip MVP** — Extended quota org-only invalidates Goal 8 generalization
9. **Apple Wallet passes** = a delightful Phase 2 add (audit-round-2 + UX agent both like it). Requires $99/yr Apple Developer membership — first paid item that's not Supabase/Vercel
10. **Email is the right primary channel** — push SMS to "users ask first"
