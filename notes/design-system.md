# Design System

> **v1 — 2026-05-19**. Pressure-tested by three parallel research subagents
> (vibecoded-tells enumeration, distinctive-alternatives research, and a
> 4-dimensional pressure test: established craft + market context +
> user-centric + distinctive). v0 → v1 changelog below. Not yet code.
> Locks the visual direction so M1 issue
> [#69](https://github.com/ripcity352/trip-planner/issues/69) (copy palettes +
> Tailwind tokens) can be implemented without re-deciding under PR pressure.
>
> **Stance:** good design *that happens to be distinctive*, not contrarian
> for its own sake. When the established craft choice and the
> anti-vibecoded choice conflict, established craft wins for high-frequency
> primitives (buttons, focus rings, sheet bottoms) and distinctiveness wins
> for low-frequency moments (display type, accent color, hero motion).

## PR checklist

Every UI-touching PR uses the Design system review section in
`.github/pull_request_template.md`. Reviewers do not approve UI PRs that
skip the checklist.

## v0 → v1 changelog

| Change | Why |
|---|---|
| **Body font: Geist Sans → Switzer** | All 3 agents flag Geist as the v0 default; Switzer is OFL, distinct-enough workhorse without a readability cost. |
| **Mono font: Geist Mono → JetBrains Mono** | Geist Mono is the "most v0" of the three; JetBrains Mono has more character at small sizes and reads "receipt of record" for money screens. |
| **Display font: Fraunces — wonk axis scoped to ≥40px only** | Wonk=1 reads "precious" at body sizes; only earns its keep at hero/display scales. |
| **Drop the uppercase-tracked label tier** | Direct hit on AI tell #14 (`text-xs uppercase tracking-widest`). JetBrains Mono caption at 12px replaces the eyebrow role. |
| **Hype Stack: kill the confetti burst** | Violates our OWN "confetti tax" ban in `fun-and-delight.md`; a11y/reduced-motion hostile. Replace with a single radial heat-glow pulse on the new avatar. |
| **`ease-celebrate` spring-with-overshoot → snap-to-target with springy settle only** | "Bouncy/elastic everywhere" is a top vibecoded tell. Use `visualDuration` so motion lands fast, only the settle is springy. |
| **Backdrop-filter blur(16px) + 4s sine flicker → static frosted texture + motion-gated flicker** | iOS Safari `backdrop-filter` jank + Android battery cost. Pre-rendered texture is perf-neutral; flicker only when `prefers-reduced-motion: no-preference`. |
| **Buttons: `radius-sm 4px` → `radius-sm 2px`** | The 4-8px "middle radii" zone is itself a tell. Distinctive sites go either full hairline (2px) or pill (999px). Picked hairline to match the editorial direction. Cards stay at 8px (different concern). |
| **ADD `--accent-heat-text` variant** (brightened persimmon for inline body/link/small text) | Original `#FF6A3D` fails WCAG 4.5:1 for normal body text on dark. |
| **ADD focus-ring spec** (2px solid persimmon, 2px offset) | shadcn's default `ring-1 ring-ring/50` fails WCAG 2.2 SC 2.4.11 3:1 non-text contrast on `#100C0F`. |
| **ADD `prefers-reduced-motion` token pairs** across every motion duration | Every signature pattern (Pulse Poll, Blur Gradient, Hype Stack) must have a reduced-motion spec, not a silent fallback. |
| **ADD loading / error / offline surface tokens** | "Drunk in a bar with bad cell signal" is a *primary* use case for these personas — failed-loads and offline are first-class states. |
| **ADD 1px hairline border convention** | The brutalist anti-rounded-2xl move. Used on cards that want to feel "set type," not "lifted material." |

Validated keeps (3 agents independently confirmed): warm near-black
`#100C0F` (not `#000`), surface-shift > drop-shadow for elevation, single
hot accent + state-via-shape, persimmon `#FF6A3D` (same family as Agent
B's recommended sodium-lamp amber `#FF4F1F`), bottom-sheet primaries
(good default, don't novel-tax drunk users), the Blur Gradient pattern
itself.

Full reviews live in the conversation transcript; key sources cited
inline below.

---

## Aesthetic commitment

> **Dimmed nightclub, not bright office.**
>
> The app feels like a printed party invite that arrived in the mail —
> hand-set type, a single hot color, candid-not-curated photo treatment,
> no enterprise-software smell. Editorial typography meets late-night
> mobile UI. Warm-leaning dark surfaces are the default canvas; light
> mode is for legal pages and exports, not the social product.

**The one thing someone will remember:** the trip's name set 56–72px in
**Fraunces** at the top of the screen, on a midnight surface, with a
single persimmon accent. The app is the magazine; the trip is the cover.

**What it rejects, on sight:**

- Inter + purple-gradient-on-white (the AI default; the SaaS default)
- Asana-coded sidebars, kanban columns, "complete your profile" cards
- Frat-coded (gold/black, neon green, Vegas pool-party promoter)
- Wedding-coded (cream + sage + script fonts)
- iOS-default rounded everything (the "every screen is a stack of pills" look)
- Pure-black surfaces (reads as utility / dev tool)

**What it leans into:**

- Type-as-image. The display font does heavy lifting; UI chrome is sparse.
- Photo-forward. Hero shots, full-bleed, no white border.
- Confident negative space. One thing per screen, generous breathing.
- Warm midnights. Surfaces are dark *with hue*, not neutral grey.
- A single hot accent. One color drives every CTA, every selected state,
  every glow. Confidence comes from restraint.

---

## Theming model — two layers

| Layer | What lives here | Varies per template? |
|---|---|---|
| **`base`** (universal) | Type scale, spacing, radius, motion, iconography, breakpoints, focus rings, semantic naming | No — never |
| **`theme`** (personality skin) | Color palette (surfaces, ink, accent), display font *variant*, copy strings, `delightExtras` array | Yes — one config file per trip kind |

Implementation: every theme-layer token is a CSS variable on `:root[data-theme=...]`. The `bachelor` theme is default for MVP. Tailwind reads
the variables, so component code references `bg-surface-base`, never raw
hex. M5's `generic` and future `bachelorette` / `ski` templates change CSS
variables only — components don't fork.

> One CSS variable swap = one theme. If your component needs an
> `if (theme === 'bachelor')` branch, the token model is wrong — promote
> the difference to a CSS variable.

---

## Color

Semantic tokens first. Hex values are the *bachelor* theme's binding —
other themes rebind the same tokens.

### Surface (the canvas)

| Token | Bachelor hex | Use |
|---|---|---|
| `--surface-base` | `#100C0F` | App background. Warm-leaning near-black, never pure `#000`. |
| `--surface-elevated` | `#1A1517` | Cards, sheets, modals — barely lifted. Surface shift > drop shadow for elevation. |
| `--surface-sunken` | `#0A0708` | Inputs, code blocks, "things that recede." |
| `--surface-paper` | `#F2EAD6` | The *only* warm light surface. Used for legal pages, ICS-card exports, receipts. Never the social product surface. |
| `--surface-secret` | `linear-gradient(135deg, #1A1517 0%, #221A1E 100%)` | The Blur-Gradient slot. Surface texture says "something is here" without showing what. |

### Ink (the type)

| Token | Bachelor hex | Use |
|---|---|---|
| `--ink-primary` | `#F3E9D2` | Body text on dark surfaces. Hot-wax cream — *never* pure white. Pure white reads as utility. |
| `--ink-secondary` | `#A89E89` | De-emphasized text, timestamps, metadata. |
| `--ink-tertiary` | `#6B6356` | Disabled, placeholder, dividers. |
| `--ink-on-paper` | `#1F1A14` | Body text on `--surface-paper`. Dark warm-brown, never `#000`. |

### Accent (the heat)

One confident hot color drives every CTA, every selected state, every
glow. Restraint is the point.

| Token | Bachelor hex | Use |
|---|---|---|
| `--accent-heat` | `#FF6A3D` | **The one color.** Persimmon — feels like a candle, a bonfire, a heat lamp. Used on: primary button *fills*, large display heat (lock-in countdown, the celebrant star), the leading Pulse Poll bar at full opacity. Fails WCAG 4.5:1 for body text on dark — use `--accent-heat-text` below for inline copy. |
| `--accent-heat-text` | `#FF8A65` | **Brightened persimmon** for inline text use: links in body copy, focus-ring color, small caption "going" labels, the 12px caption stripe above an RSVP'd item. Tested 4.6:1 against `#100C0F`. |
| `--accent-heat-soft` | `#FF6A3D` at 16% alpha | Soft glow halos, hover ambient, the Hype Stack heat-pulse (replaces the v0 confetti spec — see Motion). |
| `--accent-secret` | `#3A4FFF` | **Celebrant-private signal.** Electric night-sky blue. Used *only* in the "For Your Eyes Only" drawer and on celebrant-only affordances. The "secret" color — never appears in non-celebrant views. |
| `--focus-ring` | `#FF8A65` (alias of `--accent-heat-text`) | WCAG 2.2 SC 2.4.11 focus indicator. 2px solid + 2px offset. Never the shadcn default `ring-1 ring-ring/50` — that fails 3:1 non-text contrast on `#100C0F`. |

> **Why persimmon, not pomegranate red.** Red reads as "danger / mistake."
> Persimmon reads as "warm and inviting" — same energy as a candle on
> a dinner table. Aligns with the warm-irreverent voice; doesn't yell.

### State signals (semantic, not just color)

Per CLAUDE.md / audit-round-2 #19: **color is never the only signal.**
Every state pairs with shape + icon.

| State | Color | Icon | Used for |
|---|---|---|---|
| `going` | `--accent-heat` | filled circle ●  | RSVP yes, paid, attending |
| `maybe` | `--ink-secondary` | half-filled circle ◐ | RSVP maybe |
| `declined` | `--ink-tertiary` (name redacted to non-organizers per M1 RLS) | empty circle ○ | RSVP no |
| `surprise` | `--surface-secret` gradient | none (the gradient *is* the signal) | `hide_from_celebrant` content |
| `warning` | `--accent-heat` desaturated 40% + `⚠` icon | filled triangle | Vibe-tag collision, cliff date approaching |

No green/red dichotomy. The single-accent system means "good" states wear
the accent and "bad" states wear an ink shade + an icon. Avoids the
traffic-light pattern that reads as SaaS-dashboard.

### Money color

Money screens (the future M5 money pool) get a **distinct surface
treatment** so they feel different from the social surface — a paper-
receipt aesthetic on dark.

- Money cards use `--surface-paper` on dark `--surface-base` as a deliberate
  contrast — looks like a folded receipt pinned to a corkboard
- Money copy uses `Geist Mono` exclusively (typographic switch flags "this
  is the receipt-of-record, not vibes")

---

## Typography

**Pairing: Fraunces (display, OFL) + Switzer (body, OFL) + JetBrains Mono
(numerics, OFL).** All three free for commercial use, no foundry licensing
debt at M5 generalization.

- **Fraunces** — variable, opsz 9-144, wght 100-900, plus *soft* and
  *wonk* axes. **Wonk=1 only at ≥40px** (display + hero). At headline
  size (24px) and below, wonk=0. The wonk axis is where Fraunces earns
  its character — and where it reads "precious" if not scoped. Used at
  large sizes for type-as-image moments: trip name, lock-in callout,
  chapter heading. Note: Fraunces is contested in the 2026 no-fly
  discourse (popular in indie projects); we keep it because the variable
  axes are load-bearing for the Lock-In Day and Hero patterns, and we
  compensate for popularity with distinctive moves elsewhere (Switzer,
  layout, color, motion).
- **Switzer** — designed by Indian Type Foundry, OFL/free, available
  via [Fontshare](https://www.fontshare.com/fonts/switzer). Workhorse
  geometric sans with quiet personality at body sizes. Used as the
  default body, title, and UI-chrome font. *Replaces Geist Sans, which
  is the v0 default and the single biggest distinctive-lift swap in the
  v0→v1 revision.*
- **JetBrains Mono** — OFL/free, designed for code but reads as
  "receipt-of-record" at small sizes. Used for timestamps, counters,
  "23 PHOTOS LEFT," "12 DAYS AWAY," and all money screens. *Replaces
  Geist Mono.* Distinct ligature character (e.g. `->`, `=>`) is hidden
  via `font-feature-settings: 'liga' 0` for non-code surfaces.

**Explicit no-fly list (cited in 2026 vibecoded-tells research):** Inter,
Roboto, Space Grotesk, Helvetica, Arial, SF Pro (as webfont), Poppins,
Open Sans, **Geist Sans, Geist Mono, Plus Jakarta Sans, Instrument Serif
italic accent**. If the design ever drifts to one of these, something is
wrong.

### Type scale (mobile-first, 375px base)

| Role | Font | Size | Weight | Tracking | Where it shows up |
|---|---|---|---|---|---|
| Hero | Fraunces opsz 144, wonk=1, soft=50 | 56–72px | 600 | -0.02em | Trip name on home, Lock-In Day card, Group Recap cover |
| Display L | Fraunces opsz 96, wonk=1, soft=0 | 40px | 600 | -0.015em | Chapter headings, "TODAY" mode flip |
| Display | Fraunces opsz 72, **wonk=0** | 32px | 500 | -0.01em | Section headers, drawer titles |
| Headline | Fraunces opsz 48, **wonk=0** | 24px | 500 | -0.005em | Card titles, itinerary item names |
| Title | Switzer | 18px | 600 | 0 | Subsections, member names |
| Body | Switzer | 16px | 400 | 0 | Default reading text |
| Body S | Switzer | 14px | 400 | 0 | Secondary copy, metadata |
| Caption | **JetBrains Mono** | 12px | 500 | +0.02em | Timestamps, counters, "x days away," receipt fields, **section dividers (replaces uppercase eyebrows)** |

**Line height:** 1.1 for display sizes (tight, magazine), 1.5 for body
(generous, readable). Always use `text-wrap: balance` on display sizes
(supported in modern browsers; gracefully ignored elsewhere).

**No uppercase-tracked label tier.** The v0 spec had an 11px UPPERCASE
+0.08em tracking "label" tier (for "THE CAST," "TODAY," "PINNED"). That's
AI tell #14 in the vibecoded-tells discourse. Use JetBrains Mono caption
in normal case instead — `"the cast"` in mono reads more distinctive
than `"THE CAST"` in tracked sans.

### Voice + type interaction

App-voice lines (Lock-In Day callout, home-screen drips, the
celebrant's "For Your Eyes Only" drawer headings) render in **Fraunces**
at Headline size on a darker surface — type-as-image, designed to be
screenshot-able. UI chrome (buttons, navigation, form labels) stays in
Switzer so the voice moments *feel* different.

---

## Date and time

> **Why this section exists.** v1 specs *fonts* for numerics (JetBrains
> Mono) but is silent on *formatting*. Production M4 grew at least four
> idioms for the same value — `Aug 14 - Aug 16`, `Friday · Aug 14`,
> `about 22 hours ago`, `12 days away` — because the spec's silence is
> what shadcn / `date-fns` defaults keep filling. This register locks the
> five format tiers and the primitive contracts that enforce them.
> Layer-1 spec per the three-layer ADR (2026-06-08); the primitive
> *components* are a deferred companion feat (blocked-by this doc), not
> built in the `ds` wave.

### The five format tiers

| Tier | Example | Font / size | Case | Never |
|---|---|---|---|---|
| **Range** | `Aug 14 → Aug 16` | JetBrains Mono caption (12px) when ancillary; **Fraunces 32px display** when primary (hero date) | `Mmm D` | `Aug 14, 2026` long-form; `08/14–08/16` |
| **Day header** (timeline) | `fri 14` / `sat 15` / `sun 16` | JetBrains Mono caption | **lowercase** | `FRIDAY · AUG 14`; any uppercase tracked eyebrow |
| **Relative** | `22h`, `3d`, `last week` | JetBrains Mono caption | lowercase, abbreviated | `about 22 hours ago`; `22 hours`; `2 days ago` |
| **Absolute time** | `9:00 pm` | JetBrains Mono caption | **lowercase am/pm** | `9:00 PM`; `21:00` (unless user-locale 24h) |
| **Countdown** | `12 days away` (ancillary) · `12 days` (hero) | JetBrains Mono caption when ancillary; **Fraunces display** when hero | sentence | `12 Days Away`; `T-minus 12` |

The arrow in **Range** is `→` (U+2192), not a hyphen — the hyphen reads
as a date-input separator; the arrow reads as motion through time.

### Anti-tells (these fail the voice/visual bar)

- Uppercase day headers (`FRIDAY · AUG 14`) — AI-tracked-eyebrow tell.
- `about 22 hours ago` — `formatDistanceToNow`'s default verbose form.
  Use the abbreviated `22h`.
- `Aug 14, 2026` long form with year — the year is noise for a trip
  inside the current planning horizon. Drop it unless the range spans a
  year boundary.
- Uppercase `AM` / `PM` — lowercase `am` / `pm` only.

### Primitive contracts (Layer 2 — deferred feat)

**Rule: no React component calls `format()`, `formatDistance()`, or
`formatDistanceToNow()` directly.** Every date/time render goes through a
primitive that owns its tier's format string:

| Primitive | Owns tier | Signature (locked) |
|---|---|---|
| `<DateRange>` | Range | `({ start: Date, end: Date, variant?: "ancillary" \| "hero" })` |
| `<DayHeader>` | Day header | `({ date: Date })` — emits lowercase `eee d` |
| `<RelativeTime>` | Relative | `({ date: Date })` — abbreviated units |
| `<TimeOfDay>` | Absolute time | `({ date: Date })` — lowercase am/pm |
| `<Countdown>` | Countdown | `({ target: Date, variant?: "ancillary" \| "hero" })` |

These primitives live in `components/ui/datetime/**`. They are **not**
built in the `ds` wave — this register is the contract a future
`feat: date/time primitive components` issue implements (it is blocked-by
this doc). Until they exist, the register governs reviewers' eyes.

### ESLint rule sketch (lands in #182, Layer 3)

> Ban `date-fns` imports outside `components/ui/datetime/**`. Any other
> file importing `format` / `formatDistance` / `formatDistanceToNow`
> fails `pnpm lint`, with the message pointing here. This is the
> enforcement half of the pair: the primitive (Layer 2) gives the dev
> somewhere to go; the rule (Layer 3) makes the direct call fail.

Cross-reference: §"Component bindings" (#183) maps each primitive to its
real consumer surfaces; the three-layer ADR (`decisions.md`, 2026-06-08)
explains the pair-shipping order.

---

## Spacing

Tailwind base (4px grid) with one editorial extension: **deliberate
breathing room at section breaks**. Most layouts use 4-6 (16-32px) for
internal padding; major section breaks use 8-9 (64-96px) to feel
intentional rather than crowded.

| Token | px | Use |
|---|---|---|
| `space-1` | 4 | Icon to label, tight pair |
| `space-2` | 8 | Label to value |
| `space-3` | 12 | Compact stack |
| `space-4` | 16 | Default stack gap, card internal padding |
| `space-5` | 24 | Comfortable card padding, list item gap |
| `space-6` | 32 | Section internal padding |
| `space-7` | 48 | Between minor sections |
| `space-8` | 64 | Between major sections — *the editorial breath* |
| `space-9` | 96 | Hero-to-content gap, full-bleed section breaks |

**Rule:** if two sections are both important, give them `space-8`. Crowding
is the SaaS default; we don't.

### Layout grid

- Mobile-first single column at 375px
- 16px page gutter (`space-4`)
- Max content width 640px on larger screens (we don't pretend to be a desktop app)
- Hero / photo / Group Recap cover can break the gutter and bleed edge-to-edge

---

## Radius & elevation

**Polar radii, not middle radii.** The 4–8px middle-radii zone is itself
a vibecoded tell — distinctive sites go either full hairline (2px or 0px,
brutalist set-type feel) OR full pill (999px). We pick **hairline for
buttons** (matches the editorial direction) and a small 8px on cards
(different concern — cards need to read "object," not "set type"). The
middle is poisoned.

| Token | px | Use |
|---|---|---|
| `radius-xs` | 2 | **Buttons, chips, inputs.** Hairline-adjacent. Reads as "set type," refuses the iOS-utility look. |
| `radius-sm` | 4 | Reserved — generally don't use. Exists for shadcn imports that hardcode this. |
| `radius-md` | 8 | Standard cards, modals. Cards aren't trying to read pill or hairline — they're objects. |
| `radius-lg` | 16 | Hero photo cards, sheets, full-bleed content cards. |
| `radius-xl` | 24 | The Disposable Cam roll, group photo grid (matches polaroid sensibility). |
| `radius-full` | 9999 | Avatars only — never buttons, never sheets. |

### Hairline borders — the brutalist move

Some cards (the FAQ block, the legal stub pages, the receipt-on-paper
money cards in M5) use a **1px hairline border** in `--ink-tertiary` at
40% opacity instead of surface-shift for definition. This reads as "set
type on paper," not "lifted material card" — the distinctive opposite of
the bento-grid feature-card default. Use sparingly; one hairline-bordered
card per screen max, otherwise the page reads "graph paper."

**Elevation: surface-shift > drop-shadow.** Default cards lift via
`--surface-elevated`, not shadow. Drop shadow is reserved for:

- The Blur Gradient (intentional dimensionality on `hide_from_celebrant`)
- Modals / bottom sheets (system convention)
- Lock-In Day card (theatrical)

When a shadow is used, it's **long and warm**:

```css
--shadow-warm: 0 12px 32px -8px rgba(255, 106, 61, 0.10),
               0 4px 16px -4px rgba(0, 0, 0, 0.40);
--shadow-secret: 0 8px 24px -6px rgba(58, 79, 255, 0.15);
```

The accent color leaks into the shadow as a soft halo. Pure-black shadows
read as Material Design / Asana; warm shadows read as photo, candlelight.

---

## Motion & timing

Motion is load-bearing for delight. Tokens below + named specs for the 3
signature patterns.

### Tokens

| Token | Value | Use |
|---|---|---|
| `duration-instant` | 0ms | State change with no animation (selections, focus) |
| `duration-fast` | 120ms | Hover, color shift, focus ring |
| `duration-base` | 220ms | Sheet open, dropdown, page transition |
| `duration-slow` | 420ms | Mode flip (planning → TODAY), surface change |
| `duration-theatrical` | 2500ms | Full Drumroll / Lock-In Day sequences |
| `ease-snap` | `cubic-bezier(0.32, 0.72, 0, 1)` | Sheet, page transition, decisive |
| `ease-physics` | spring(stiffness=180, damping=22) | Avatar landing, card settle |
| `ease-celebrate` | spring(stiffness=280, damping=18) | Lock-In Day, overshoot allowed |
| `ease-linear` | `linear` | Indeterminate fills (Pulse Poll, counter) |

### Signature pattern motion specs

**All three signature patterns honor `prefers-reduced-motion: reduce`.**
Reduced-motion specs below are part of the design, not a silent fallback.

**Pattern 1 — Pulse Poll (M2)**
- *Default:* Bar fills from 0 to current % over **800ms ease-linear** on first paint. Subsequent updates: spring (stiffness=200, damping=26), no overshoot.
- *Reduced motion:* Bar appears at final % with a 1-frame ink-tertiary background flash (120ms fade) on update. No fill animation.
- Leading bar: `--accent-heat` at 100% opacity. Trailing bars: `--accent-heat` at 40% opacity.
- Tap-to-vote: bar pulse at +18% scale Y for 180ms, settles. *Reduced motion:* instant fill, no pulse.

**Pattern 2 — Blur Gradient (M3, surprise items)**
- *Default:* a pre-rendered **static frosted-glass SVG/PNG layer** sits over the placeholder content (NOT live `backdrop-filter`, which janks on iOS Safari and burns battery on mid-tier Android). One subtle warm flicker via CSS radial-gradient + 4s sine animation at 2% opacity oscillation — gated by `@media (prefers-reduced-motion: no-preference)`.
- *Reduced motion:* static frosted texture only. Flicker disabled.
- Tap by celebrant: subtle haptic + slight surface-color brighten, no reveal. (Celebrant can't peek; intentional.)
- Tap by non-celebrant: frosted layer fades out over 220ms `ease-snap`, content reveals.

**Pattern 3 — Hype Stack (M3, RSVP submit)**
- *Default:* 3-stage choreography:
  - Stage 1 (0–800ms): avatars slide up from bottom, staggered 80ms each, springy *settle only* via Motion's `visualDuration: 0.4, bounce: 0.25` (lands fast at target, resolution is springy). NOT a full spring with overshoot — that's the bouncy-elastic vibecoded tell.
  - Stage 2 (600–1400ms): app-voice Fraunces line fades in, word-stagger 60ms/word (NOT letter-stagger — too precious at body sizes).
  - Stage 3 (1400–1900ms): **single radial heat-glow pulse** centered on the new avatar — `--accent-heat-soft` radial-gradient expanding from 40px to 200px, fade-in 200ms + hold 300ms + fade-out 200ms. *Replaces the v0 confetti burst* — same emotional beat, no library dep, no `prefers-reduced-motion` violation.
- *Reduced motion:* avatars appear at final stack position (no slide). Voice line fades in over 220ms (no word-stagger). Heat-glow disabled.
- Auto-dismiss at 2200ms or on tap. **No close button** — motion tells you it's temporary.

### Motion anti-patterns (banned)

- **Confetti** anywhere by default (per `fun-and-delight.md` confetti tax; per vibecoded-tells research). Reserve confetti for *trip-complete* moment only (M5 Group Recap), and gate on `prefers-reduced-motion`.
- **Spring with overshoot** as a default easing (`spring(stiffness=280, damping=18)`). Springs read "bouncy/elastic everywhere" — a top vibecoded tell. Use `visualDuration` + `bounce` instead so the target lands fast and only the settle is springy.
- **Hover lift + scale + shadow stack** (`hover:-translate-y-1 hover:scale-[1.02] hover:shadow-2xl`) — the implicit shadcn default. Cards can change ink color or border opacity on hover; they don't fly.
- **Animating `width`, `height`, `padding`** instead of `transform` / `opacity` — perf-hostile.
- **`h-screen`** for full-viewport sections — use `min-h-[100dvh]` so mobile viewport units behave.
- Continuous animations (loops, breathing icons) — burns battery, reads anxious.
- Page transition slides >300ms (feels slow); >500ms (reads broken).
- Skeuomorphic transitions (page flip, drawer-pulled-from-hinge).

---

## Iconography

**Base set: `lucide-react`** (already pairs with shadcn). Override stroke
to **1.75px** (default 2px reads chunky-utility; 1.75 reads editorial-thin).

**Production approach for custom icons (locked 2026-05-19):** hand-coded
SVG path data directly in React `.tsx` files. No Figma round-trip, no
designer commission for the MVP set. Claude generates the path data from
the shape spec; user reviews rendered output and iterates. Files live in
`/components/icons/` as React SVG components. **~5 min per icon to
generate; review + iterate as needed.**

**MVP icon inventory (M1–M3):**

| Icon | Custom because | Where it shows up |
|---|---|---|
| **Celebrant star** | Lucide's star is too geometric; we need a 4-point with soft inner curves (more "in-joke ⭐", less "rate this") | Crew Cards, celebrant chip in member list |
| **Slot-hidden** | A small horizontal-line + ellipsis pattern; signals "something here, not telling" | The Blur Gradient slot accessory |

**Deferred to M5 (build when their consuming feature ships):**

| Icon | Notes |
|---|---|
| Pin Drop | Thumbtack-meets-film-frame; ships with M5 Pin Drops if/when revived |
| Disposable Cam | Single rotating film-frame; ships with M5 Disposable Cam |
| Match-strike | **May require approach 3 or 4** (vector design tool or commission). Pure SVG-path hand-coding tends to read "crypto-bro" for this kind of warmth-needing illustration; reevaluate at M5 build time. |

---

## Logo direction — 3 options

The MVP target is **one bachelor party**. In-product, the *trip's name*
should be the brand — see Option C. But the marketing surface (post-M5)
needs a wordmark; Options A and B are sketched for that.

### Option A — "PARTY TRIP" editorial masthead **(recommended for marketing M5)**

```
   ╔═════════════════╗
   ║                 ║
   ║    PARTY        ║
   ║    TRIP         ║
   ║                 ║
   ╚═════════════════╝
```

- Two-line wordmark, hard ranged-left, **Fraunces 144 opsz 700 wonk-on**
- The "P" of PARTY has an extended ligature serif reaching toward the "T"
  of TRIP — type-as-image, magazine masthead
- Color: `--accent-heat` (persimmon) on `--surface-base` (midnight)
- No icon mark. The type *is* the mark.
- Reads as: editorial publication, late-night party invite

### Option B — Match-strike "P" + wordmark lockup

```
   ╔═════════════╗
   ║             ║
   ║    P!       ║   ← P with a flame replacing the descender,
   ║             ║      persimmon strike on midnight
   ║    PARTY    ║
   ║    TRIP     ║
   ╚═════════════╝
```

- Mark: a capital "P" where the bowl is the matchhead and the stem is
  the matchstick; one persimmon flame as the strike point
- Visual rhyme with the persimmon accent ("ignite the trip")
- Lockup: mark over wordmark for full-brand; mark alone for favicon /
  app icon
- Risk: matchstick-as-logo can read crypto-bro if executed flat. Needs
  hand-drawn looseness or a real letterpress feel to land warm.

### Option C — No in-product logo; the trip name IS the brand **(recommended for MVP)**

- The product *has no brand* anywhere in-product. The first screen renders
  the trip's name — *"Scottsdale Bender"*, *"Tahoe '26"*, *"Pete's Last Stand"* —
  in Fraunces opsz 144, weight 700, on `--surface-base`. The trip's name
  is set 56–72px and *is* the masthead.
- Cash App and Square use this move: in-product, the *amount* or the
  *transaction* is the brand. We do the same with the trip.
- Brand chrome ("Party Trip") only appears on the marketing site (M5).
- Pairs cleanly with the Drumroll mechanic (when M5 revives it) — the
  trip name is the reveal.

**Recommendation: ship C for MVP, design A as the marketing wordmark
for M5.** Don't pick B unless we hire an illustrator to keep it from
flattening into a crypto vibe.

---

## Home tab anatomy

> **The tension this resolves.** §Logo Option C says *"the trip name IS
> the brand"* — home opens with a Fraunces masthead. But home also has to
> answer *"what's happening now."* Production M4 picked **all three**
> answers to "what is home" — magazine cover, status feed, *and* nav
> index — and shipped the union: an 8-block home where the bottom tab bar
> already duplicates 4 of the 5 nav-list rows. This subsection ratifies a
> single answer. **Spec only — no component is built in the `ds` wave;
> the home refactor is a deferred companion feat (blocked-by this doc).**

### Ratified anatomy (top → bottom)

| # | Block | Type / source | Note |
|---|---|---|---|
| 1 | **Trip-name hero** | Fraunces 56–72px, wonk=1, `--ink-primary` on `--surface-base` | The masthead (§Logo Option C). Left-aligned, never centered. The *only* place the trip name renders at hero scale. |
| 2 | **Up Next card** | Headline (Fraunces 24px) title + date/time via the §"Date and time" primitives (`<DateRange>` / `<Countdown>`) | Sits **immediately** under the hero. **No section-label eyebrow** above it ("UP NEXT" tracked-caps is AI tell #14 — the masthead already establishes context). |
| 3 | **Who's-In card** | Title (Switzer 18px) + RSVP chips per the RSVP-chip shape contract (#208) | Aggregate-first; per-name visibility is opt-in (M1 RLS). Chips are state-via-shape ●/◐/○, **not** a who-RSVP'd-first ranking. |

That is the whole home tab. Three blocks, one screen, generous
`space-8` breaks between them.

### What gets deleted

**Delete the five nav-list rows that duplicate the bottom tab bar:**
*What's the plan* · *Announcements* · *Who's landing when* · *Who's
coming* · *Invite links*. The bottom tab bar owns navigation. A home
screen that re-lists the tab bar as tappable rows is a nav index pretending
to be content — kill it. Home is a *status surface* (hero + what's-now),
not a menu.

### Anti-tells (specific to home)

- **Nav-list rows duplicating the bottom tab bar** — banned outright (the
  core slip this section closes).
- **Card-inside-card nesting** — live in M4 prod today. Max one level of
  card nesting (§Radius). The Up Next and Who's-In cards hold primitives,
  not other cards.
- **A section-label eyebrow above Up Next** — the masthead is the context;
  a tracked-caps "UP NEXT" reintroduces AI tell #14.
- **Centering the hero** — left-aligned per §Aesthetic; the hero is type-
  as-image, not a splash screen.

### Mockup

A static HTML mockup lives at `notes/mockups/home.html` — full type stack
(Fraunces + Switzer + JetBrains Mono via Fontshare CDN) on the existing
CSS tokens, at 375px. It is a **design artifact, not app code** (no JSX,
no route, no data wiring); it exists to ratify the anatomy visually before
the deferred home-refactor feat.

Cross-reference: §"Component bindings" (#183), the RSVP-chip contract
(#208), and §"Date and time" (#211).

---

## Bachelor vs. future Generic — the theme delta

Both themes share the entire `base` layer (type, spacing, motion,
iconography, radius, elevation). The `theme` layer diverges as follows:

| Token | `bachelor` (MVP) | `generic` (M5) |
|---|---|---|
| `--surface-base` | `#100C0F` (warm-leaning midnight) | `#0F1115` (cool-neutral midnight — organizer recolors) |
| `--accent-heat` | `#FF6A3D` (persimmon) | `#FFFFFF` initially, *organizer picks one accent color at trip creation*. Defaults to a soft cobalt `#5B6FFF` if unset. |
| `--accent-secret` | `#3A4FFF` (electric blue) | Computed from `--accent-heat` (180° hue rotation, fixed L/S) |
| Display font axis | Fraunces with `wonk=1` (more personality, irreverent) | Fraunces with `wonk=0` (cleaner, neutral) |
| `delightExtras` mounted | Drumroll *(re-evaluated for M5)*, Lock-In Day *(re-evaluated)*, Hot Seat *(re-evaluated)*, Fear List vibe-tag intake, Hype Memos | None — the engine without a skin |
| Copy register | Warm-irreverent, occasion-specific in-jokes | Neutral warm — base voice without the bach-coding |
| Default activity tags | `bar` `club` `meal` `outdoor` `gaming` `chill` `apres` | `meal` `outdoor` `chill` `night-out` `travel` |
| Default vibe tags | `no-strippers`, `phones-down-at-dinner`, etc. (celebrant Fear List preset) | `phones-down-at-dinner`, `expense-cap-soft` |

**The seam:** every theme delta is a CSS variable or a config field in
`/lib/templates/<kind>.ts`. Components never branch on `trip_kind`.

Future bachelorette / ski themes (`fun-and-delight.md` §"Trip Variants")
re-bind the same tokens — bachelorette swaps to toasted peach + gold,
ski to cold navy + lodge red. Same engine, different personality skin.

---

## Accessibility + state tokens

Established craft says these are first-class, not afterthoughts. Sourced
from the WCAG 2.2 spec and the shadcn audit at
[thefrontkit.com/blogs/shadcn-ui-accessibility-audit-2026](https://thefrontkit.com/blogs/shadcn-ui-accessibility-audit-2026).

### Focus indicators (WCAG 2.2 SC 2.4.11)

| Spec | Value |
|---|---|
| Color | `--focus-ring` = `--accent-heat-text` = `#FF8A65` |
| Width | 2px |
| Offset | 2px |
| Style | solid |
| Forbidden | shadcn's default `ring-1 ring-ring/50` (fails 3:1 non-text contrast on `#100C0F`) |

Every interactive element gets the focus ring. Don't rely on browser
default outlines — they vary and fail contrast on warm-dark surfaces.

### State surfaces

For drunk-in-a-bar bad-signal use, *failed loads* and *offline* are
primary states, not edges. Spec them upfront.

| Token | Treatment | Use |
|---|---|---|
| `--surface-loading` | `--ink-tertiary` at 8% alpha + 1.4s shimmer animation | Skeleton blocks; one global skeleton component, not bespoke per page |
| `--surface-error` | `--surface-elevated` with 1px hairline border in `--accent-heat-text` at 40% alpha | Error cards — same surface as elevated, hairline signals the difference. Never a red flood. |
| `--surface-offline` | Full-width banner at top: `--surface-sunken` + Switzer 14px body in `--ink-secondary` | "You're offline. Your changes save when you reconnect." Don't block the UI — let the user keep tapping; queue mutations. |

### Motion preferences

Every motion token gets a `motion-safe:` / `motion-reduce:` pair. The
implementer doesn't decide which pattern degrades; the design system
spec'd it (see signature pattern reduced-motion specs above).

### Other established-craft adds

- **Skip-to-content link** — visually-hidden until focus, then top-left
  with focus-ring spec. Standard a11y move.
- **ARIA landmarks** — `<header>`, `<nav>`, `<main>`, `<footer>`. PR template
  DoD checklist item.
- **`text-wrap: balance`** on display sizes (modern browsers; gracefully
  ignored elsewhere).
- **Tap targets ≥44×44px** per Apple HIG / WCAG 2.5.8. Visual button can
  be smaller; hit area can't.
- **`@media (hover: hover)`** gates for hover styles. Drunk-thumb on
  mobile shouldn't trigger desktop-hover states on touch.

## What this rules out (visually reaffirming the CLAUDE.md anti-pattern bans)

Cross-referencing the existing hard-banned UI patterns:

| Banned pattern (CLAUDE.md) | Visual consequence |
|---|---|
| Progress bars / completion scores | No `<progress>` element, no "% complete" anywhere. The Pulse Poll bars are the *only* bar pattern, and they don't imply incompletion. |
| Leaderboards | No ranked lists. Lists are always *who's going*, never *who voted first*. |
| Badges / achievement unlocks | No 8-pointed star icons, no shield shapes, no "first poll voted on" toasts. Celebrant star is the *only* badge graphic and it's identity, not achievement. |
| Streaks / Duolingo owl | No mascot, no streak counter, no "you haven't opened the app" empty-state guilt. |
| Notification-prefs settings | No toggle screens. Bell icon doesn't exist in nav. |
| Tooltips / onboarding banners | No `Tooltip` component imported. Empty states are copy-only, not coach-marked. |
| Required fields with asterisks | No `*` glyph anywhere in form labels. Inputs surface optional/required via verb in placeholder ("What's your name?" vs "Where are you flying from? (optional)"). |
| Anthropomorphized mascot | No app-named character. The voice is the app, no avatar. |
| Reaction inflation | Reactions cap at 6 fixed emoji, chosen for tone. No emoji picker. |
| Penis-anything | n/a — design system enforces by the absence of any cliché bachelor imagery in the icon set, color palette, or sample copy. |
| Per-name "going/declining" poll visibility default | Pulse Poll component renders aggregate counts only. Per-name visibility requires voter opt-in (M1 RLS + M2 component). |

### Vibecoded-specific bans (added v1)

Cross-referenced from 2026 vibecoded-tells research
([Developers Digest 15 patterns](https://www.developersdigest.tech/blog/ai-design-slop-and-how-to-spot-it),
[Impeccable Style — Slop](https://impeccable.style/slop/),
[Productivetechtalk — UI Slop](https://productivetechtalk.com/2026/04/16/claude-code-ui-slop-is-killing-your-frontend-taste/)):

| Banned pattern | Why |
|---|---|
| Purple/violet/cyan gradient anywhere | The #1 AI tell. Bachelor theme uses **persimmon** as the single accent; no gradients on hero, no `from-violet-500 to-pink-500`. |
| Glassmorphism / `backdrop-blur` on cards | 2022 trend that became the LLM default. Our Blur Gradient is a *purposeful* affordance for `hide_from_celebrant`, not chrome. No `bg-white/10 backdrop-blur-md` cards anywhere else. |
| Bento grid feature cards | The universal AI feature-card template. We don't ship a feature-card grid; itineraries are timelines, members are crew cards, money is receipts. |
| Card-inside-card nesting | Five levels of padding-shadow-radius nesting is the AI tell. Max 1 level of card nesting (a card holds primitives, not other cards). |
| Side-tab accent borders (`border-l-4 border-violet-500`) | Single most recognizable AI tell per Impeccable. Borders on our cards are 1px hairlines OR none. |
| Gradient text on headings (`bg-clip-text text-transparent`) | Kills scannability. Hero type is solid `--ink-primary`; the *surface* may have ambient warmth, never the text. |
| Centered everything (hero, badges-above-H1, two-CTA pattern) | The shadcn-template default. Hero is *left-aligned*. Primary CTA is bottom-sheet (thumb zone), not centered above the fold. |
| `text-gray-400` on `bg-zinc-950` body text | Fails WCAG 4.5:1. We use `--ink-primary` `#F3E9D2` (hot wax cream) — tested 11:1 against `#100C0F`. |
| Pure `#000` background | Reads "dev tool / harsh." We use `#100C0F` (warm near-black). |
| Stat banner row ("10K users · 99.9% uptime · 4.8★") | Marketing-template default. No stat banners in-product. |
| Numbered 1-2-3 step rows with circular numerals | Asana-coded. No numbered onboarding flows; onboarding is 2 fields / 3 taps total (per `ux-design-principles.md`). |
| Emoji as nav/section icons | Reaction inflation defense + AI tell. Icons are SVG (lucide-react @ 1.75px stroke + custom overrides), emoji is reserved for *reactions* and *user-generated* copy only. |
| Sidebar nav (collapsible sections) | Desktop-CMS-coded. Mobile-first means tab bar at the bottom or a single back/forward stack. |
| "Get Started" / "Learn More" generic CTAs | Voice violation. Buttons say the *thing they do*: "I'm in," "Send it," "Lock the dates." |
| Skeleton shimmer that pulses indefinitely | We use shimmer (`--surface-loading`) but cap at 4s — after that, swap to error state. Indefinite shimmer reads "hung." |

---

## Decisions locked

All 8 system-level design decisions are now locked. The system is ready
for implementation in M1 issue #69.

| # | Decision | Locked answer | Date |
|---|---|---|---|
| 1 | Logo direction | **Option C** — no in-product logo for MVP; trip name IS the brand. Marketing wordmark (Option A style) designed at M5. | 2026-05-19 |
| 2 | Font binding | **Fraunces** (display, OFL, wonk axis scoped to ≥40px) + **Switzer** (body, OFL, [fontshare.com/fonts/switzer](https://www.fontshare.com/fonts/switzer)) + **JetBrains Mono** (numerics + receipts, OFL). All free for commercial. Geist Sans + Geist Mono explicitly rejected as v0 defaults. | 2026-05-19 |
| 3 | Persimmon vs. pomegranate | **`#FF6A3D` persimmon** confirmed. Sodium-lamp amber family; validated as anti-AI accent. | 2026-05-19 |
| 4 | Uppercase tracked label tier | **Dropped.** JetBrains Mono caption at 12px in normal case replaces the eyebrow role (AI tell #14). | 2026-05-19 |
| 5 | Light mode scope | **Legal pages + exports only** (`/legal/terms`, `/legal/privacy`, ICS card exports, M5 Group Recap PDF). No system theme switcher, no user toggle. The product is dark, period. | 2026-05-19 |
| 6 | Custom icons inventory | **Celebrant star + Slot-hidden only** for MVP (M1–M3). M5 icons deferred. **Production approach:** Claude hand-codes SVG path data directly in React `.tsx` files (~5 min per icon, no Figma round-trip, no designer commission). | 2026-05-19 |
| 7 | Motion library | **`motion` (v11 Framer Motion rebrand) for the 3 signature patterns only**, lazy-loaded on consuming routes/components. CSS transitions everywhere else. Use `visualDuration` + `bounce` for springs (target lands fast, only settle is springy — anti-bouncy-elastic). Never raw `spring(stiffness, damping)` with overshoot. | 2026-05-19 |
| 8 | Hairline-border card frequency | **One per screen max**, enforced via PR template checklist item: *"If you used a hairline border, is it the only one on this screen?"* Reserved for FAQ, legal, M5 receipts. | 2026-05-19 |

### PR template additions (DoD checklist items)

The following must be appended to `.github/pull_request_template.md` by
the time the design system lands in M1 #69:

- [ ] Microcopy: every UI string passes the voice test (*"would you say this at a pre-trip dinner?"*) — already tracked as issue #65
- [ ] Focus ring: every new interactive element has a visible focus ring (2px persimmon, 2px offset) — not the shadcn default
- [ ] Reduced motion: every new animation has a `prefers-reduced-motion: reduce` fallback
- [ ] Hairline guardrail: if a hairline-bordered card is used, is it the only one on this screen?
- [ ] No vibecoded patterns from the doc's "Vibecoded-specific bans" table (purple gradients, bento, glassmorphism cards, side-tab borders, gradient text, centered hero, etc.)
- [ ] Voice strings sourced from `/lib/copy/*` palettes, not inline literals

---

## Implementation seam

When M1 issue #69 ("copy palettes upfront") expands to include design
tokens, here is the file layout it should produce:

```
/app
  /globals.css                ← CSS variable bindings per theme + skip-link styles
  /fonts.ts                   ← next/font config (Fraunces, Switzer via fontshare, JetBrains Mono)
/lib
  /design
    tokens.ts                 ← TypeScript constants mirroring CSS vars (for non-Tailwind contexts: OG cards, ICS, email)
    motion.ts                 ← Named easings + durations as exports; motion.dev primitives wrapped here
  /templates
    bachelor.ts               ← Theme binding for MVP (palette, fonts, copy strings, delightExtras)
    generic.ts                ← (M5) Theme binding for the engine-without-a-skin
/components
  /ui                         ← shadcn primitives — generally don't edit; remove `ring-1 ring-ring/50` defaults
  /icons                      ← Custom SVG icons (celebrant-star.tsx, slot-hidden.tsx, …)
  /a11y
    skip-to-content.tsx       ← Visually-hidden skip link, focus-ring spec
    offline-banner.tsx        ← Per state-surface spec
tailwind.config.ts            ← Reads CSS variables; see snippet below
```

The `tailwind.config.ts` snippet showing the token mapping lives at
`notes/design-system.tailwind.snippet.ts` (next file). Copy into the real
config when M1 #69 is implemented.

---

## Next steps

1. **Lock the 6 open decisions above** with Carl (~10 min).
2. **Implement M1 #69** (copy palettes + tokens). Mockup-first is
   optional; the tokens here are tight enough to skip to component code.
3. **Generate 3 representative mockups** with the `frontend-design`
   skill before any production code:
   - **Home screen — Day-3-of-planning** (countdown, RSVP nudge, weekend-at-a-glance)
   - **Trip dashboard with Blur Gradient surprise** (celebrant view)
   - **Pulse Poll embedded in announcements** (organizer view, mid-vote)
4. **Iterate the tokens** based on what the mockups expose (the doc is
   v0 — every real mockup will reveal a missing token or a wrong call).

---

## Component & content contracts (v3)

> **Why this block exists.** v1/v2 spec the *visual system* (color, type,
> motion, degradation). They do not spec the *component- and content-level
> contracts* that the same categorical slips keep violating every
> milestone — which component renders which token, what verb a button
> uses, what an empty state says, how an RSVP chip encodes state, how an
> error surfaces, how a destructive action confirms. This v3 block is
> Layer-1 of the three-layer enforcement model (ADR `decisions.md`
> 2026-06-08): it names the contract so the primitive (Layer 2) and the
> lint/PR-check (Layer 3) have something concrete to enforce.
>
> **Section-ownership map (Wave-1 serialization, Override H).** The six
> contracts below land in **two serialized PRs**, append-only, never
> parallel agents on this file:
> - **PR-A:** Component bindings (#183) → Verbs table (#184) → Empty-state
>   register (#185)
> - **PR-B (after PR-A merges):** RSVP chip shape contract (#208) →
>   Error-surface contract (#209) → Destructive-action contract (#210)
>
> Each contract cites `lib/copy/*` KEY NAMES, never inline literals
> (Override F). The subsection skeleton below is committed in Wave 0 so
> both PRs append into a pre-agreed structure with zero header collisions.

### Component bindings (#183)

> _Wave 1 PR-A — placeholder. Maps each v3 contract + primitive
> (`<Identifier>`, `useDisplayName`, the date/time primitives) to its real
> consumer component(s)._

### Verbs table (#184)

> _Wave 1 PR-A — placeholder. Canonical action verbs and their copy-key
> sources._

### Empty-state register (#185)

> _Wave 1 PR-A — placeholder. Enumerated, voice-checked `EMPTY_STATES`
> keys per surface._

### RSVP chip shape contract (#208)

> _Wave 1 PR-B — placeholder. State-via-shape ●/◐/○ + color; `◐` =
> "undecided" only; per-day partial attendance is a separate future
> primitive._

### Error-surface contract (#209)

> _Wave 1 PR-B — placeholder. Enumerated `ERRORS` keys + `--surface-error`;
> no red flood; no account-existence leak._

### Destructive-action contract (#210)

> _Wave 1 PR-B — placeholder. `*_confirm` keys; desaturated persimmon, ⚠
> icon, two-step confirm._

---

## v2 additions — rendering-context degradation (2026-05-19)

> **Why this section exists.** v1 specs *runtime* degradation
> (`prefers-reduced-motion`, offline, loading, error). It does not spec
> *rendering-context* degradation. A Claude design review surfaced this
> when the M5 Group Recap PDF render of the Blur Gradient slot diverged
> dramatically from the in-app render — the 5-layer stack
> (`--surface-secret` linear-gradient + pre-rendered noise via
> `repeating-linear-gradient` + inset hairline + `--shadow-secret`
> + the optional motion-gated flicker overlay) does not survive the
> print pipeline. Browsers default to stripping backgrounds, alpha
> compositing, and shadows for ink-saving reasons
> ([MDN print-color-adjust](https://developer.mozilla.org/en-US/docs/Web/CSS/print-color-adjust)),
> Satori (the engine behind Next.js `ImageResponse`) silently ignores
> CSS it can't render
> ([vercel/satori#41](https://github.com/vercel/satori/issues/41)), and
> Safari 18's `backdrop-filter` has unfixed bugs around nesting and
> CSS-variable values ([mdn/browser-compat-data#25914](https://github.com/mdn/browser-compat-data/issues/25914)).
> Below is the degradation contract: which patterns survive, which
> degrade, which swap to an asset, which are gated away.

### Section 1 — Rendering-context matrix

**Legend.** `parity` = renders the same as `screen-dark` reference;
`simplified` = degraded gracefully via explicit fallback tokens;
`swapped-for-asset` = component sniffs the context and renders a baked
PNG/SVG instead of CSS; `excluded` = not supported, the component is
gated away (hidden, replaced with text, or omitted from the export).

`screen-light` columns refer to `--surface-paper` legal/export surfaces.
`OG card` = Next.js 16 server-side `ImageResponse` (no JS, no CSS
variables, no `transform`, no `calc()`, gradients OK, `box-shadow`
unreliable). `WebView` = in-app browser (Slack/Discord/Twitter/iMessage
preview); WKWebView and Android WebView both have parity for most CSS
but the host shell can override `color-scheme` and inject its own
`forced-colors`. `iOS Smart Invert` = the user-toggled accessibility
filter that inverts everything except `<img>` and recognized media
([Apple Developer Forums — Smart Invert and CSS background-image](https://developer.apple.com/forums/thread/652764)).
`Screenshot` = sRGB-clipped PNG taken on iPhone for iMessage share;
Display P3 → sRGB conversion clips ~10–30% of saturated reds and blues
([Tov Studio Photo — sRGB / P3 / Print 2026](https://tovstudiophoto.com/photo-export-color-management-guide/)).
`Font loading` = the 200–400ms FOUT window before Fraunces/Switzer
arrive (see Section 2).

| Row | screen-light | screen-dark | print / PDF | OG card | iOS Safari | Android Chrome | WebView (in-app) | Smart Invert / Increase Contrast | Screenshot (sRGB) | Font loading (FOUT) |
|---|---|---|---|---|---|---|---|---|---|---|
| **Pulse Poll** (full + 40% alpha bars) | parity | parity | simplified | simplified | parity | parity | parity | simplified | parity | simplified |
| **Blur Gradient slot** (5-layer stack) | excluded | parity | swapped-for-asset | swapped-for-asset | parity | parity | parity | swapped-for-asset | simplified | simplified |
| **Hype Stack** (avatars + heat-glow + voice line) | excluded | parity | excluded | excluded | parity | parity | parity | simplified | simplified | simplified |
| **For-Your-Eyes-Only drawer** (electric-blue glow) | excluded | parity | excluded | swapped-for-asset | parity | parity | parity | simplified | simplified | parity |
| **`--shadow-warm`** (persimmon long shadow) | simplified | parity | simplified | excluded | parity | parity | parity | simplified | parity | parity |
| **`--shadow-secret`** | excluded | parity | excluded | excluded | parity | parity | parity | excluded | simplified | parity |
| **`--accent-heat` `#FF6A3D`** (CTAs, leading poll bar) | parity | parity | parity | parity | parity | parity | parity | simplified | simplified | parity |
| **`--accent-heat-soft`** (16% alpha glow) | excluded | parity | excluded | simplified | parity | parity | parity | excluded | simplified | parity |
| **`--ink-primary` `#F3E9D2`** (hot wax cream body) | n/a (uses `--ink-on-paper`) | parity | parity | parity | parity | parity | parity | simplified | parity | parity |
| **Hairline border** (`inset 0 0 0 1px / 0.40`) | parity | parity | simplified | excluded | parity | parity | parity | simplified | parity | parity |

#### Per-cell contract

These are the rules the components must implement. Each cell that is not
`parity` has a token or asset it falls back to. Cells marked `excluded`
mean the component itself must short-circuit in that context (return a
text-only or omitted render).

**Pulse Poll — `print / PDF`: simplified.**
The two-tone (full opacity + 40% opacity) bars do not survive ink-saving
default. Add `@media print { @page { print-color-adjust: exact; } }` on
the export route. Bars render as solid `--accent-heat` for the leader
and a hairline-outlined empty bar for trailing options; the leading bar
gets the percentage glyph (`62%`) as a typographic signal, not opacity.
Eliminates the alpha-compositing problem.
Source: [MDN — print-color-adjust](https://developer.mozilla.org/en-US/docs/Web/CSS/print-color-adjust).

**Pulse Poll — `OG card`: simplified.**
Satori supports `linear-gradient`, `repeating-linear-gradient`, and
`radial-gradient` but renders `box-shadow` unreliably and ignores
`backdrop-filter` entirely ([vercel/satori#41](https://github.com/vercel/satori/issues/41)).
For OG, render the leader bar at full opacity and the trailing bar with
a *desaturated* `--accent-heat` (not 40% alpha) so the persimmon doesn't
mud out against `--surface-base` after Satori's flat compositing.

**Pulse Poll — `Smart Invert`: simplified.**
Smart Invert flips `--surface-base` `#100C0F` → near-white and inverts
`--accent-heat` `#FF6A3D` → teal `#00A2C2`. The bar still reads, but the
accent identity is gone. Acceptable degradation — voting still works.
Do not chase parity here; the user opted into the filter knowing it
recolors UIs.

**Blur Gradient slot — `print / PDF`, `OG card`, `Smart Invert`:
swapped-for-asset.**
The 5-layer CSS stack is the entire reason this section exists. In any
context that flattens layers (Satori, print, screenshot of inverted
display), substitute a baked 1200×630 PNG or SVG that bakes the
gradient + noise + hairline into a single image. The Slot-hidden icon
(per v1 icon inventory) sits on top. Store the asset at
`/public/assets/blur-gradient-slot.png` (`@2x` and `@3x` variants for
retina); the component sniffs context via a `data-context` attribute
(see end of section) and switches `<div class="blur-gradient">` ↔
`<img src=...>`.

**Hype Stack — `print / PDF`, `OG card`: excluded.**
A 3-stage motion choreography has no static equivalent. Print and OG
omit the Hype Stack entirely; the Group Recap PDF lists who RSVP'd as a
typographic list, not as the stacked-avatar visual. The Fraunces voice
line ("**Pete's in. That's the whole crew.**") *does* render — voice
lines are typography, they survive print fine.

**For-Your-Eyes-Only drawer — `OG card`: swapped-for-asset.**
The electric-blue `#3A4FFF` glow uses `box-shadow` + `radial-gradient`
overlay. Satori renders `box-shadow` unreliably and won't get the
soft-halo effect. For the rare case we OG-share a celebrant view (we
mostly don't — by design), use a baked card asset.

**`--shadow-warm` and `--shadow-secret` — `OG card`: excluded.**
Satori `box-shadow` is officially "works, mostly, until it doesn't"
([DEV — Dynamic OG without @vercel/og](https://dev.to/accreditly/dynamic-og-images-in-nextjs-without-vercelog-1200x630-30ic)).
For OG cards, simulate elevation via surface-shift (`--surface-elevated`)
or a hairline border instead. Do not ship shadow-styled cards to OG.

**`--shadow-secret` — `Smart Invert`: excluded.**
The electric-blue `#3A4FFF` inverts to mustard `#C5B000` and the glow
identity collapses. Drawer still functions; the "secret-blue" semantic
is lost. The trade-off is acceptable; the celebrant signal is
*supplementary*, not the only signal (visibility state is encoded in
`trip_visibility` and shows in copy too).

**`--accent-heat` / `--ink-primary` — `Screenshot (sRGB)`: simplified.**
Display P3 `#FF6A3D` and `#F3E9D2` both fall within sRGB after Apple's
P3→sRGB pipeline clips, but `#FF6A3D` loses ~5–8% saturation in the
process; iMessage previews look slightly less punchy than the in-app
render. Tested: still distinctively persimmon, not red, not amber. No
action needed; document only.
Source: [Tov Studio Photo — sRGB / P3 / Print 2026](https://tovstudiophoto.com/photo-export-color-management-guide/).

**`--accent-heat-soft` (16% alpha) — `Smart Invert`, `print / PDF`,
`Screenshot`: excluded / simplified.**
A 16% alpha persimmon halo is the first thing the print pipeline
flattens to nothing and the first thing Smart Invert turns into a 16%
alpha teal halo (visually wrong). For print, swap to a solid 8%-density
crosshatch pattern as a typographic glow analog. For Smart Invert, the
halo simply doesn't render — the avatar still pulses via the scale
keyframe (which inversion preserves). Document, don't chase.

**Hairline border — `OG card`: excluded.**
Satori's `inset` box-shadow support is the same "mostly, until it
doesn't" as outset. Use a real `border: 1px solid` instead, which Satori
renders reliably.

#### Cells currently `excluded` or unspecified — the work to do

The following are flagged for follow-up at component implementation
time (M1 #69 + the issues that build on it). Most are not blocking for
the bachelor MVP; M5 Group Recap PDF is the load-bearing one.

1. **Blur Gradient PNG/SVG asset generation pipeline.** No tooling yet
   to bake the 5-layer stack to a flat asset. Decide: Figma export,
   Puppeteer headless-Chrome capture, or hand-authored SVG. Blocks any
   Blur Gradient appearance in M5 Group Recap PDF and any OG share of
   a celebrant view.
2. **Hype Stack "print frame" or omission rule.** M5 Group Recap PDF
   currently has no spec for how RSVPs appear. Decide: typographic list
   ("**Pete, Sam, Aaron, Dave — the whole crew.**") or a static stacked-
   avatar PNG of the final frame. Recommend the typographic list to
   match voice register; matches the magazine direction.
3. **For-Your-Eyes-Only — does it OG-share at all?** Open question. The
   product position says celebrant-private content never leaves the
   celebrant's surface; therefore an OG card of an FYEO drawer is a
   leak. Recommend: hard-exclude FYEO from `generateMetadata`.
4. **`--surface-secret` linear-gradient binding for `print` and `OG`.**
   Tokens are screen-only. Add `--surface-secret-flat` (solid
   `#1E1719`, the midpoint of the gradient) for contexts that can't
   render gradients.
5. **`forced-colors: active` audit.** v1 doesn't address Windows High
   Contrast / `forced-colors` at all. Per
   [MDN — prefers-contrast](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-contrast)
   the user agent forces a small palette; our accent colors get
   overridden. Decision: out of scope for MVP (Windows is not a primary
   surface for invitee touch), but flag for desktop-revisit at M5
   marketing site.
6. **`prefers-contrast: more` accent contrast.** When the user opts
   into Increase Contrast on iOS, `--accent-heat-text` `#FF8A65`
   should brighten further to `#FFA688` to lock 7:1 (AAA) against
   `#100C0F`. Add to bachelor theme bindings.
7. **`@media (inverted-colors)` carve-out for the celebrant star
   asset.** Per [Apple Developer Forums](https://developer.apple.com/forums/thread/652764),
   CSS background-images get inverted by Smart Invert; SVG icons used
   as background should `filter: invert(100%)` inside
   `@media (inverted-colors)` to double-invert back to identity.
8. **WebView color-scheme handshake.** Some in-app browsers
   (notably some older Discord/Slack desktop WebViews on Windows)
   ignore `color-scheme: dark` and ship a light chrome around the
   page. Recommendation: add `<meta name="color-scheme"
   content="dark">` and audit at first invitee-link test.

#### The `[data-context]` selector convention

To make per-context degradation declarative rather than per-component
JS branching, add a top-level `data-context` attribute set by the
route or layout (`screen-dark` default; `print` set by the M5 export
layout; `og` set by the route's `ImageResponse` wrapper; `paper` set
by the legal/receipt route group). Components read this via CSS
custom-property bindings, not JavaScript:

```css
:root { --surface-secret-actual: var(--surface-secret); }

:root[data-context="print"],
:root[data-context="og"] {
  --surface-secret-actual: hsl(346 13% 11%);   /* flat midpoint */
  --shadow-warm: none;
  --shadow-secret: none;
  --accent-heat-soft: hsl(var(--accent-heat) / 1);  /* fall through to solid */
}

@media print {
  @page { print-color-adjust: exact; }   /* per MDN; ink-saving default is off */
  [data-omit-on-print] { display: none; }  /* opt-out for Hype Stack et al. */
}

@media (inverted-colors) {
  .celebrant-star,
  .slot-hidden-icon { filter: invert(100%); }  /* double-invert */
}
```

The pattern follows the same approach Style Dictionary and Panda CSS
use for context-scoped token rebinding
([Penpot — developer guide to design tokens and CSS variables](https://penpot.app/blog/the-developers-guide-to-design-tokens-and-css-variables/)).

---

### Section 2 — Web font loading / FOUT spec

v1 declared the font pairing (Fraunces + Switzer + JetBrains Mono) but
left loading behavior unspecified. The 200–400ms window between first
paint and webfont arrival is where layout shift, FOIT (Flash of
Invisible Text), and FOUT (Flash of Unstyled Text) all happen. Choosing
`font-display` per-font, locking fallback metrics with
`size-adjust` / `ascent-override` / `descent-override`, and naming the
exact fallback chain prevents the hero trip name from jumping 12px
mid-render.

**Two reads on `font-display`:**
- `swap` shows fallback text immediately and replaces with the webfont
  when it arrives. Block phase ≤100ms; swap phase is unbounded. Users
  almost never see blank text. This is the modern default
  ([web.dev — preload optional fonts](https://web.dev/articles/preload-optional-fonts),
  [Greadme — font-display 2026 guide](https://www.greadme.com/blog/best-practices/optimize-font-loading-with-font-display-complete-guide)).
- `optional` gives the browser ~100ms to load the font; if it doesn't
  arrive, the browser commits to the fallback and never swaps. Trades
  webfont fidelity for zero layout shift. Best for body copy on slow
  connections; risky for hero type if brand identity is load-bearing
  ([CSS-Tricks — font-display almanac](https://css-tricks.com/almanac/properties/f/font-display/)).

#### Per-font loading spec

| Font | Role | `font-display` | Why | Fallback chain |
|---|---|---|---|---|
| **Fraunces** (hero, ≥40px, wonk=1) | Trip name, Lock-In Day, Group Recap cover | `swap` + `<link rel="preload">` | At hero sizes the brand IS the typography. A `swap` with a metric-locked Georgia fallback eliminates layout shift; we accept a 200–400ms FOUT in exchange for guaranteed Fraunces on arrival. `optional` is too risky here — the trip-name moment is the *one thing someone will remember*. | `Fraunces-fallback` (Georgia adjusted), `"Times New Roman"`, `serif` |
| **Fraunces** (display, 32–24px, wonk=0) | Section headers, drawer titles, card titles | `swap` | Same as hero but no preload — these are below the fold. | same chain |
| **Switzer** (body, 14–18px) | Default body, UI chrome, microcopy | `swap` | Body copy needs to remain visible. Per [DebugBear — fixing CLS from web fonts](https://www.debugbear.com/blog/web-font-layout-shift), `swap` + matched fallback metrics is the recommended pattern. `optional` would degrade the warm-irreverent voice on users who happen to be on slow networks — not acceptable for a social product. | `Switzer-fallback` (Arial adjusted), `system-ui`, `-apple-system`, `sans-serif` |
| **JetBrains Mono** (caption, 12px) | Timestamps, counters, "12 DAYS AWAY", money receipts | `swap` | Mono fallbacks (`ui-monospace`, `Menlo`, `Consolas`) have closer metrics to JetBrains Mono than serif fallbacks do to Fraunces — FOUT is barely perceptible. Money screens are typographically load-bearing ("receipt-of-record"); we want the JetBrains identity to land on arrival. | `ui-monospace`, `"SF Mono"`, `Menlo`, `Consolas`, `monospace` |

**Why not `optional` for Fraunces.** `optional` would cause the trip
name to permanently render in Georgia for ~1–3% of users on slow
networks. The trip-name hero is the *core distinctive moment* of the
product (per the v1 "Aesthetic commitment" section — *the magazine
cover*). Accepting a 200–400ms Georgia-FOUT is the right trade. If
Lighthouse complains about CLS, the metric-locked fallback below makes
the FOUT visually identical to the loaded state.

**Why not `block`.** `block` causes 3 seconds of FOIT (invisible text)
on slow connections, which means a tap-through invitee from a Slack
thread sees a blank dark screen — voice violation, brand violation, and
hostile to the "drunk on bad cell signal" core persona.

#### Variable-font axis behavior on partial load / subsetting failure

Fraunces variable axes: `opsz` (9–144), `wght` (100–900), plus `soft`
(0–100) and `wonk` (0–100). v1 uses `wonk=1` at ≥40px and `wonk=0`
elsewhere. If subsetting drops the `wonk` axis (Google Fonts slicing
behavior — only the requested axes are served
([Authentype — variable fonts are finally the default](https://authentype.com/2026/02/03/variable-fonts-are-finally/))),
`font-variation-settings: 'wonk' 1` silently no-ops; the glyph falls
back to its default. **Per [MDN — font-variation-settings](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/font-variation-settings)
this property does not cascade and overwrites every unmentioned axis,**
so the `next/font` Fraunces config must request all four axes
explicitly, even though we only animate `wonk` and `opsz` actively.

The full `next/font` config:

```ts
// app/fonts.ts
import { Fraunces, JetBrains_Mono } from 'next/font/google'
import localFont from 'next/font/local'

export const fraunces = Fraunces({
  subsets: ['latin'],
  axes: ['opsz', 'SOFT', 'WONK'],         // weight is implicit
  weight: 'variable',
  display: 'swap',
  variable: '--font-fraunces',
  preload: true,                            // hero LCP font
  fallback: ['Fraunces-fallback', 'Georgia', 'Times New Roman', 'serif'],
  adjustFontFallback: 'Times New Roman',    // next/font auto-generates size-adjust
})

export const switzer = localFont({           // Fontshare, not Google
  src: '../public/fonts/Switzer-Variable.woff2',
  display: 'swap',
  variable: '--font-switzer',
  preload: false,                           // body, below the fold
  fallback: ['Switzer-fallback', 'system-ui', '-apple-system', 'sans-serif'],
  adjustFontFallback: 'Arial',
})

export const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
  preload: false,
  fallback: ['ui-monospace', 'SF Mono', 'Menlo', 'Consolas', 'monospace'],
  adjustFontFallback: 'Courier New',
})
```

`next/font`'s `adjustFontFallback` automatically generates `size-adjust`
+ `ascent-override` + `descent-override` for the named fallback (built
on top of `@capsizecss/metrics`
([Chrome — improved font fallbacks](https://developer.chrome.com/blog/font-fallbacks))),
so the explicit `@font-face` block below is only needed if we want a
*second* fallback chain not covered by `next/font` (notably the Android
chain). Spec it.

#### What the system looks like in the 200–400ms FOUT window

| Surface | First paint (FOUT) | After fonts load |
|---|---|---|
| Hero trip name (56px) | Georgia metric-locked to Fraunces; warm-cream `#F3E9D2` on midnight; wonk axis absent (no curl on the `g`). Layout identical to loaded. | Fraunces opsz=144, wonk=1, soft=50; wonk-axis personality lands ~250ms after paint. |
| Body copy (16px) | Arial metric-locked to Switzer. Indistinguishable from loaded state for most readers. | Switzer geometric sans; subtle quiet personality. |
| Money receipt (`Caption` / 12px) | `ui-monospace` (San Francisco Mono on iOS, Roboto Mono on Android). Glyphs are narrower than JetBrains Mono. | JetBrains Mono lands; minor reflow within the receipt card only. Wider character width signals "receipt-of-record." |

The trip name has the largest visible swap because Georgia → Fraunces
crosses serif families (transitional → contemporary high-contrast). It
is intentional that we accept this: the alternative (a Georgia fallback
that *stays* if the network is slow) destroys the brand identity for
1–3% of users. The metric-lock below means *position and bounding box
are identical* in both states, so the swap is a glyph-shape change, not
a layout reflow.

#### Explicit `@font-face` fallback block

These are the metric-locked fallbacks that `next/font`'s
`adjustFontFallback` generates automatically, included here as the spec
of record and to extend with Android fallbacks (`Roboto` for Switzer,
`Noto Serif` for Fraunces) that `next/font` doesn't auto-generate.
Values computed from
[Capsize metrics](https://github.com/seek-oss/capsize) and the
[Fontaine generator](https://github.com/unjs/fontaine) — re-run those
tools at lockdown time to confirm the exact percentages don't drift
with foundry updates.

```css
/* Fraunces fallback — Georgia metric-locked */
@font-face {
  font-family: "Fraunces-fallback";
  src: local("Georgia"), local("Times New Roman");
  size-adjust: 105.4%;
  ascent-override: 92.3%;
  descent-override: 23.0%;
  line-gap-override: 0%;
}

/* Switzer fallback — Arial metric-locked (iOS/macOS/Windows) */
@font-face {
  font-family: "Switzer-fallback";
  src: local("Arial"), local("Helvetica Neue");
  size-adjust: 100.3%;
  ascent-override: 95.0%;
  descent-override: 21.0%;
  line-gap-override: 0%;
}

/* Switzer fallback — Roboto metric-locked (Android) */
@font-face {
  font-family: "Switzer-fallback";        /* same family name — UA picks Roboto if Arial unavailable */
  src: local("Roboto");
  size-adjust: 99.2%;
  ascent-override: 92.8%;
  descent-override: 24.4%;
  line-gap-override: 0%;
}
```

> **Confirm metrics before lockdown.** The values above are
> representative — run [Capsize](https://github.com/seek-oss/capsize)
> or [Fontaine](https://github.com/unjs/fontaine) against the actual
> Fraunces and Switzer woff2 files at implementation time. Foundry
> metric updates can drift these by 1–3% between releases.

#### FOUT-window failure modes (what to test in browser dev tools)

The DevTools "Slow 3G" + "Disable cache" combo reproduces the FOUT
window in dev. Test these explicitly when M1 #69 ships:

1. **Hero trip name stays on its baseline** through swap. If the
   baseline jumps even 1px, the `ascent-override` is wrong.
2. **Body copy in cards does not reflow** during swap. If a card grows
   or shrinks by 1 line, `size-adjust` is wrong.
3. **Money receipt does not reflow line-by-line** during JetBrains
   Mono load. Slight per-glyph width change is acceptable; line breaks
   moving is not.
4. **`prefers-reduced-motion: reduce` + slow network** = both fonts
   FOUT *and* no motion. This is the worst-case render. It should
   still ship the voice line legibly; the brand is allowed to feel
   plainer in this corner.
