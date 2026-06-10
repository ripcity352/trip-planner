# Radius audit — #289 remainder (calc-scale reconcile)

2026-06-10 · CARRY Wave-1 PR 1c · branch `chore/radius-audit`

The deliberate app-wide `rounded-*` audit the
[#289 slice-1 ADR](./decisions.md) mandates before the shadcn calc radius
scale ("the poisoned middle") can be reconciled to the polar spec
(`design-system.md` §Radius). **Verdict: 46 visually-changing call sites
under the ratified decision rule — 7.7× over the N=6 re-scope trigger.
#289 closes re-scoped; the reconcile is a follow-up issue.**

## Method

```
grep -rEon "rounded(-(t|b|l|r|tl|tr|bl|br|s|e|ss|se|es|ee))?(-(xs|sm|md|lg|xl|2xl|3xl|4xl|full|none))?(-?\[[^]]+\])?" \
  app/ components/ --include="*.tsx" --include="*.ts"
```

Plus explicit checks for bare `rounded` at a class boundary and
`rounded-[Npx]` arbitrary values — **zero of either exist** (slice 1
allowed `rounded-[2px]` for pre-existing sites; none survive). 101
call-site lines / 109 class occurrences total. `e2e/`, `tests/`,
`lib/` contain no `rounded-*` (UI classes live only in `app/` +
`components/`).

## What the current scale computes to (the math)

`app/globals.css` ships shadcn's calc scale in `@theme inline` (L42–51):

```css
--radius-xs: 2px;                        /* slice 1 — literal, polar */
--radius-sm: calc(var(--radius) * 0.6);
--radius-md: calc(var(--radius) * 0.8);
--radius-lg: var(--radius);
--radius-xl: calc(var(--radius) * 1.4);
--radius-2xl: calc(var(--radius) * 1.8);
--radius-3xl: calc(var(--radius) * 2.2);
--radius-4xl: calc(var(--radius) * 2.6);
```

`@theme inline` makes each utility emit the *declared expression*, so the
`var(--radius)` inside resolves per-element against the cascade. The base:

- `[data-theme="bachelor"]` (L200): `--radius: 0.5rem` = **8px** — the
  operative value; `app/layout.tsx` hardcodes `data-theme="bachelor"`.
- `:root:not([data-theme])` (L84): `--radius: 0.625rem` = 10px — never
  rendered (no unthemed page exists); listed for completeness only.

| Utility | Expression | Computed (bachelor, 8px base) | Polar spec (§Radius) |
|---|---|---|---|
| `rounded-xs` | 2px literal | **2px** | 2 (buttons/inputs) ✅ |
| `rounded-sm` | 8 × 0.6 | **4.8px** | 4 (reserved) |
| `rounded-md` | 8 × 0.8 | **6.4px** | 8 (cards/modals) |
| `rounded-lg` | 8 × 1.0 | **8px** | 16 (sheets/hero) |
| `rounded-xl` | 8 × 1.4 | **11.2px** | 24 (photo roll) |
| `rounded-2xl` | 8 × 1.8 | **14.4px** | — (no polar value) |
| `rounded-3xl` | 8 × 2.2 | **17.6px** | — |
| `rounded-4xl` | 8 × 2.6 | **20.8px** | — |
| `rounded-full` | `calc(infinity * 1px)` (Tailwind built-in) | pill | 9999 (avatars) ✅ |
| `rounded-[min(var(--radius-md),10px)]` | min(6.4, 10) | **6.4px** | — (button.tsx/select.tsx size variants) |
| `rounded-[min(var(--radius-md),12px)]` | min(6.4, 12) | **6.4px** | — |

**The structural trap (why this can't be a scale-only fix):** today
`rounded-lg` *happens* to compute to the polar card value (8px) and
`rounded-md` to the poisoned 6.4px. But the spec's *named* scale says
`radius-lg` = 16. Rebasing the tokens to the spec names
(`--radius-md: 8px`, `--radius-lg: 16px`, `--radius-xl: 24px`) would
silently move every `rounded-lg` popover from 8 → 16 and every
`rounded-xl` card from 11.2 → 24 — the opposite of the intent. **Scale
rebase and call-site rewrite are inseparable**; each call site must be
re-pointed at its intended polar value in the same change. That coupling
is exactly what pushes this past the N=6 single-PR guideline.

## Decision rule (ratified, per the 1c plan)

- **buttons / inputs** → `rounded-xs` (2px hairline)
- **cards / sheets / popovers** → 8px
- **chips / pills / avatars / badges** → `rounded-full` (**STAY** — do
  not sharpen the social surfaces)
- shadcn primitives in `components/ui/*` count by their rendered surface.

## Call-site table

One row per call-site line; multiple classes on a line are listed
together. "px now" = computed under the bachelor theme. Change column:
**Y** = visually meaningful change required; **y°** = class/spec change
with little or no rendered delta (no-op or focus-contour-only); **n** =
stays; **E** = pill *action button* — spec conflict needing ratification
(counted separately, see below); **F** = error banner — #209 is silent
on radius (counted separately).

### app/

| file:line | class | surface | px now | intended | Δ |
|---|---|---|---|---|---|
| `app/page.tsx:32` | rounded-md | button (landing CTA link-as-button) | 6.4 | xs 2 | **Y** |
| `app/(authed)/account/sign-in-and-security/_form.tsx:271` | rounded-xl | card | 11.2 | 8 | **Y** |
| `app/(authed)/account/sign-in-and-security/_form.tsx:493` | rounded-md | error banner (`role="alert"`) | 6.4 | 8? (#209 silent) | F |
| `app/(authed)/trips/page.tsx:102` | rounded-xl | focus-ring contour on card link | 11.2 | 8 (match card) | y° |
| `app/(authed)/trips/[tripId]/dates/_celebrant-view.tsx:125` | rounded-full | chip (date-vote) | pill | full | n |
| `app/(authed)/trips/[tripId]/dates/_member-view.tsx:178` | rounded-full | chip (date-vote) | pill | full | n |
| `app/(authed)/trips/[tripId]/itinerary/add-item-form-sheet.tsx:43` | rounded-full | pill action button ("add" disclosure) | pill | xs 2? | E |
| `app/(authed)/trips/[tripId]/itinerary/add-item-form-sheet.tsx:50` | rounded-xl | card | 11.2 | 8 | **Y** |
| `app/(authed)/trips/[tripId]/me/page.tsx:69` | rounded-xl | card | 11.2 | 8 | **Y** |
| `app/(authed)/trips/[tripId]/me/page.tsx:91` | rounded-xl | card (link row styled as card) | 11.2 | 8 | **Y** |
| `app/(authed)/trips/[tripId]/me/page.tsx:113` | rounded-full | pill action button (sign out) | pill | xs 2? | E |
| `app/dev/smoke/page.tsx:146` | rounded-sm | other (dev-only color swatch) | 4.8 | — (not user-facing) | n |
| `app/invite/[token]/page.tsx:134` | rounded-md | error banner | 6.4 | 8? (#209 silent) | F |
| `app/login/page.tsx:57` | rounded-md | error banner | 6.4 | 8? (#209 silent) | F |
| `app/login/_form.tsx:373` | rounded-md | error banner | 6.4 | 8? (#209 silent) | F |

### components/trip/

| file:line | class | surface | px now | intended | Δ |
|---|---|---|---|---|---|
| `announcements/announcement-card.tsx:44` | rounded-xl | card | 11.2 | 8 | **Y** |
| `announcements/announcement-card.tsx:49` | rounded-full | badge (organizers-only) | pill | full | n |
| `announcements/announcement-card.tsx:56` | rounded-full | badge (audience) | pill | full | n |
| `announcements/announcement-composer.tsx:107` | rounded-xl | card (composer) | 11.2 | 8 | **Y** |
| `arrivals/airline-picker.tsx:156` | rounded-md | input | 6.4 | xs 2 | **Y** |
| `arrivals/airline-picker.tsx:218` | rounded-full | icon button (clear ×, circular) | pill | xs 2? | E |
| `arrivals/airline-picker.tsx:251` | rounded-md | popover (suggestion listbox) | 6.4 | 8 | **Y** |
| `arrivals/travel-leg-card.tsx:52` | rounded-xl | card | 11.2 | 8 | **Y** |
| `arrivals/travel-leg-form-sheet.tsx:50` | rounded-xl | card (inline form sheet) | 11.2 | 8 | **Y** |
| `arrivals/travel-leg-form-sheet.tsx:67` | rounded-full | pill action button (edit CTA) | pill | xs 2? | E |
| `arrivals/travel-leg-form-sheet.tsx:81` | rounded-full | pill action button (add-leg CTA) | pill | xs 2? | E |
| `arrivals/travel-leg-form.tsx:161` | rounded-md | input (field base) | 6.4 | xs 2 | **Y** |
| `arrivals/travel-leg-form.tsx:311` | rounded-full | pill action button (submit) | pill | xs 2? | E |
| `arrivals/travel-leg-form.tsx:324` | rounded-full | pill action button (cancel) | pill | xs 2? | E |
| `arrivals/travel-leg-form.tsx:339` | rounded-full | pill action button (delete) | pill | xs 2? | E |
| `header-menu.tsx:36` | rounded-full | avatar (menu-trigger focus contour) | pill | full | n |
| `itinerary/add-item-form.tsx:129` | rounded-md | input (field base) | 6.4 | xs 2 | **Y** |
| `itinerary/add-item-form.tsx:268` | rounded-full | pill action button (submit) | pill | xs 2? | E |
| `itinerary/add-item-form.tsx:280` | rounded-full | pill action button (cancel) | pill | xs 2? | E |
| `itinerary/edit-item-form-sheet.tsx:45` | rounded-xl | card (inline form sheet) | 11.2 | 8 | **Y** |
| `itinerary/edit-item-form-sheet.tsx:62` | rounded-full | pill action button (edit CTA) | pill | xs 2? | E |
| `itinerary/edit-item-form.tsx:170` | rounded-md | input (field base) | 6.4 | xs 2 | **Y** |
| `itinerary/edit-item-form.tsx:308` | rounded-full | pill action button (save) | pill | xs 2? | E |
| `itinerary/edit-item-form.tsx:320` | rounded-full | pill action button (cancel) | pill | xs 2? | E |
| `itinerary/edit-item-form.tsx:335` | rounded-full | pill action button (delete) | pill | xs 2? | E |
| `itinerary/fields/activity-tag-picker.tsx:73` | rounded-full | chip (tag option) | pill | full | n |
| `itinerary/fields/activity-tag-picker.tsx:114` | rounded-full | chip (selected tag) | pill | full | n |
| `itinerary/fields/activity-tag-picker.tsx:125` | rounded-full | chip anatomy (remove × inside chip) | pill | full | n |
| `itinerary/fields/activity-tag-picker.tsx:148` | rounded-md | input (custom-tag field) | 6.4 | xs 2 | **Y** |
| `itinerary/fields/address-autocomplete.tsx:78` | rounded-md | input (field base) | 6.4 | xs 2 | **Y** |
| `itinerary/fields/address-autocomplete.tsx:255` | rounded-md | popover (suggestion listbox) | 6.4 | 8 | **Y** |
| `itinerary/fields/datetime-local-field-impl.tsx:36` | rounded-md | input | 6.4 | xs 2 | **Y** |
| `itinerary/fields/dress-code-picker.tsx:82` | rounded-full | chip (dress-code option) | pill | full | n |
| `itinerary/fields/dress-code-picker.tsx:107` | rounded-md | input (freeform field) | 6.4 | xs 2 | **Y** |
| `itinerary/item-card.tsx:68` | rounded-xl | card (empty-state) | 11.2 | 8 | **Y** |
| `itinerary/item-card.tsx:79` | rounded-xl | card | 11.2 | 8 | **Y** |
| `itinerary/item-card.tsx:98` | rounded-full | badge (organizers-only) | pill | full | n |
| `itinerary/item-card.tsx:127` | rounded-full | badge (activity tag) | pill | full | n |
| `itinerary/item-rsvp-chip.tsx:104` | rounded-full | chip (#208 RSVP contract) | pill | full | n |
| `itinerary/lodging-roster.tsx:147` | rounded-md | input (member select) | 6.4 | xs 2 | **Y** |
| `itinerary/lodging-roster.tsx:169` | rounded-md | input (room select) | 6.4 | xs 2 | **Y** |
| `itinerary/lodging-roster.tsx:180` | rounded-full | pill action button (assign) | pill | xs 2? | E |
| `itinerary/member-flag-picker.tsx:180` | rounded-full | chip (flag option) | pill | full | n |
| `itinerary/member-flag-picker.tsx:216` | rounded-md | input (member select) | 6.4 | xs 2 | **Y** |
| `itinerary/member-flag-picker.tsx:243` | rounded-md | input (freeform textarea) | 6.4 | xs 2 | **Y** |
| `itinerary/member-flag-picker.tsx:254` | rounded-full | pill action button (add submit) | pill | xs 2? | E |
| `itinerary/organizer-flag-view.tsx:83` | rounded-full | badge (flag) | pill | full | n |
| `now-next-card.tsx:41` | rounded-xl | card | 11.2 | 8 | **Y** |
| `now-next-card.tsx:65` | rounded-xl | card | 11.2 | 8 | **Y** |
| `now-next-card.tsx:79` | rounded-xl | card | 11.2 | 8 | **Y** |
| `roster/copy-numbers-button.tsx:48` | rounded-md | button | 6.4 | xs 2 | **Y** |
| `roster/roster-list.tsx:114` | rounded-lg | card (list row object) | 8 | 8 | y° (class drift only — already 8px) |
| `roster/roster-list.tsx:124` | rounded-full | badge (role) | pill | full | n |
| `roster/vcard-download-button.tsx:60` | rounded-md | button | 6.4 | xs 2 | **Y** |
| `rsvp-chip.tsx:82` | rounded-full | chip (#208 RSVP contract) | pill | full | n |
| `rsvp-toggle.tsx:138` | rounded-full | chip (#208 RSVP contract) | pill | full | n |
| `trip-notes-editor.tsx:89` | rounded-md | input (textarea) | 6.4 | xs 2 | **Y** |
| `trip-notes-editor.tsx:101` | rounded-md | button (save) | 6.4 | xs 2 | **Y** |
| `trip-notes-editor.tsx:109` | rounded-md | button (cancel) | 6.4 | xs 2 | **Y** |
| `trip-notes-editor.tsx:130` | rounded-md | button (edit) | 6.4 | xs 2 | **Y** |

### components/ui/ (shadcn primitives — by rendered surface)

| file:line | class | surface | px now | intended | Δ |
|---|---|---|---|---|---|
| `avatar.tsx:20` | rounded-full ×2 (base + `after:`) | avatar | pill | full | n |
| `avatar.tsx:33` | rounded-full | avatar image | pill | full | n |
| `avatar.tsx:49` | rounded-full | avatar fallback | pill | full | n |
| `avatar.tsx:62` | rounded-full | avatar status dot | pill | full | n |
| `avatar.tsx:94` | rounded-full | avatar-group overflow | pill | full | n |
| `badge.tsx:8` | rounded-4xl | badge | 20.8 (clamps to pill on h-5) | full | y° (class-only; renders pill already) |
| `button.tsx:7` | rounded-lg | button (base — **every `<Button>` in the app**) | 8 | xs 2 | **Y** |
| `button.tsx:25` | rounded-[min(var(--radius-md),10px)] + `in-data-[slot=button-group]:rounded-lg` | button (size xs) | 6.4 / 8 | xs 2 | **Y** |
| `button.tsx:26` | rounded-[min(var(--radius-md),12px)] + group rounded-lg | button (size sm) | 6.4 / 8 | xs 2 | **Y** |
| `button.tsx:30` | rounded-[min(var(--radius-md),10px)] + group rounded-lg | button (icon-xs) | 6.4 / 8 | xs 2 | **Y** |
| `button.tsx:32` | rounded-[min(var(--radius-md),12px)] + group rounded-lg | button (icon-sm) | 6.4 / 8 | xs 2 | **Y** |
| `card.tsx:15` | rounded-xl + `*:[img:first-child]:rounded-t-xl` + `*:[img:last-child]:rounded-b-xl` | card | 11.2 | 8 | **Y** |
| `card.tsx:28` | rounded-t-xl | card header | 11.2 | 8 | **Y** |
| `card.tsx:87` | rounded-b-xl | card footer | 11.2 | 8 | **Y** |
| `dropdown-menu.tsx:45` | rounded-lg | popover (menu content) | 8 | 8 | y° (already 8px) |
| `dropdown-menu.tsx:94` | rounded-md | menu item wash | 6.4 | spec silent | n |
| `dropdown-menu.tsx:119` | rounded-md | menu item wash (sub-trigger) | 6.4 | spec silent | n |
| `dropdown-menu.tsx:142` | rounded-lg | popover (submenu) | 8 | 8 | y° (already 8px) |
| `dropdown-menu.tsx:168` | rounded-md | menu item wash (radio) | 6.4 | spec silent | n |
| `dropdown-menu.tsx:209` | rounded-md | menu item wash (checkbox) | 6.4 | spec silent | n |
| `identifier.tsx:90` | rounded-sm | button (copy affordance; no bg/border — radius visible on focus ring only) | 4.8 | xs 2 | y° |
| `input.tsx:12` | rounded-lg | input | 8 | xs 2 | **Y** |
| `select.tsx:44` | rounded-lg + `data-[size=sm]:rounded-[min(var(--radius-md),10px)]` | input (select trigger) | 8 / 6.4 | xs 2 | **Y** |
| `select.tsx:86` | rounded-lg | popover (select content) | 8 | 8 | y° (already 8px) |
| `select.tsx:120` | rounded-md | menu item wash | 6.4 | spec silent | n |
| `textarea.tsx:10` | rounded-lg | input | 8 | xs 2 | **Y** |

## Counts

| Bucket | Lines | Notes |
|---|---|---|
| **Y — visually-changing under the ratified rule** | **46** | 17 cards/sheets (11.2 → 8; 4 app + 10 trip + the 3 `card.tsx` lines), 16 inputs (6.4 or 8 → 2), 11 buttons (6.4 or 8 → 2; `button.tsx:7` alone re-skins every `<Button>`), 2 popover listboxes (6.4 → 8) |
| y° — class/spec drift, ~zero rendered delta | 7 | already-8px `rounded-lg` popovers/rows (4), badge pill-clamp (1), focus-contour-only (2) |
| E — pill action buttons (spec conflict, needs ratification) | 16 | shipped M3/M4 pattern is pill CTAs; §Radius says `radius-full` "never buttons", hairline is the pick. Sharpening these is a *product-look* decision, not a drift fix — do NOT bulk-change without ratifying |
| F — error banners (#209 silent on radius) | 4 | 6.4px today; close in the follow-up alongside #301 (error-surface treatment) |
| n — stays (chips/avatars/badges/menu-item washes/dev) | 28 | social surfaces stay pill per rule |
| **Total call-site lines** | **101** | 109 class occurrences |

## Verdict — re-scope trigger fires

**46 > 6.** Per the 1c plan and the #289 slice-1 ADR, this PR lands the
audit only. No scale change, no call-site change. #289 closes as
re-scoped; the reconcile moves to a follow-up issue with this document
as its spec.

Why the follow-up is one coherent change, not 51 independent tweaks:

1. The token rebase (`--radius-md: 8px` etc. as literals, killing the
   calc derivatives) and the call-site re-pointing must land together —
   see "the structural trap" above. The no-op-today sites (`rounded-lg`
   popovers) *become* regressions the moment the scale is rebased
   without touching them.
2. `button.tsx:7` / `input.tsx:12` cascade to every rendered
   button/input — the blast radius is every screen, which wants one
   #217-baselined PR with a full 375px walk, not drive-by slices.
3. Two open questions gate ~20 of the sites and need ratification
   first: (E) whether shipped pill CTAs sharpen to the 2px hairline or
   get spec-blessed as chips ("do not sharpen the social surfaces"
   arguably covers them), and (F) the #209 error-banner radius.

## Recommended follow-up shape (for the issue)

- **Step 0 (ratify):** settle E (pill CTAs: hairline vs. spec-bless the
  pill) and F (error-banner radius) in `design-system.md` §Radius.
- **Step 1 (tokens):** rebase `app/globals.css` to polar literals —
  `--radius-md: 8px`, `--radius-lg: 16px`, `--radius-xl: 24px`,
  `--radius-full` stays built-in; drop `--radius` + the calc derivatives
  and the unused `-2xl/-3xl/-4xl` steps (one consumer, `badge.tsx:8`,
  re-points to `rounded-full`). `--radius-sm: 4px` stays reserved for
  shadcn imports per §Radius.
- **Step 2 (call sites, same PR):** apply the table above — cards
  `rounded-xl` → `rounded-md`, inputs/buttons → `rounded-xs`, popovers →
  `rounded-md`, chips/avatars/badges untouched.
- **Guard:** #217 visual baseline regen (expected shift, every surface)
  + full 375px walk; ESLint rule (d) already polices button regressions.
