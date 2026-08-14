/**
 * Empty-state copy palette — every list/section that can render empty
 * pulls its string from here, never inline literals.
 *
 * Voice test: "would you say this out loud at a pre-trip dinner?"
 * Warm, irreverent, specific. Anti-SaaS — no "Get started!", no
 * "No data yet!", no "Looks like you don't have any X."
 *
 * When adding a key:
 *   1. Add it to `EmptyStateKey`.
 *   2. Add a string to `EMPTY_STATES` (compiler enforces exhaustiveness).
 *   3. Read it aloud once. If it sounds like a SaaS onboarding email,
 *      rewrite it.
 *
 * Microcopy review is a PR-template checklist item — see
 * `.github/pull_request_template.md` and
 * `notes/research/ux-design-principles.md`.
 */

export type EmptyStateKey =
  | "itinerary"
  | "members"
  | "expenses"
  | "announcements"
  | "polls"
  | "photos"
  | "trips_mine"
  | "invites_for_trip"
  | "shopping_list_empty";

export const EMPTY_STATES: Record<EmptyStateKey, string> = {
  itinerary: "Nothing booked yet. The organizers are on it.",
  members: "Just you so far. The group chat fills in fast.",
  expenses: "No one's spent a dime — or no one's logged it. Same diff.",
  announcements: "All quiet. No news is probably good news.",
  polls: "Nothing to vote on yet. Someone's got opinions, just not here.",
  photos:
    "No photos yet. Someone has to be sober enough to take the first one.",
  trips_mine:
    "Nothing planned yet. Start a trip and we'll figure the rest out.",
  invites_for_trip:
    "No links out yet. Mint one and start texting it around.",
  shopping_list_empty:
    "List's empty. Booze, ice, mixers, sunscreen — add what we need to pick up.",
};

/**
 * CTAs paired with empty states. Partial because not every empty state
 * needs a button — sometimes the absence IS the message (e.g.
 * `announcements`, where the silence is the point).
 *
 * Same voice rules as `EMPTY_STATES`. Keep these <= 40 chars so they
 * fit on a button at 375px without wrapping.
 */
export const EMPTY_STATE_CTAS: Partial<Record<EmptyStateKey, string>> = {
  trips_mine: "Start a trip",
  // Other keys add their CTA strings here as features land.
};

/**
 * Attendee-count bucket labels for the logged-out invite preview
 * (`/invite/[token]`). The underlying RPC returns a bucket name (not
 * the raw integer — that would be an enumeration oracle) and we render
 * the corresponding string. Voice test on each: would I describe it
 * this way out loud?
 *
 * Wave 2a only — if more bucket consumers land, hoist this into its
 * own palette file. For now the two-palette discipline holds.
 */
export type AttendeeCountBucketLabelKey =
  | "just-getting-started"
  | "small-crew"
  | "full-house"
  | "big-group";

export const ATTENDEE_COUNT_BUCKET_LABELS: Record<
  AttendeeCountBucketLabelKey,
  string
> = {
  "just-getting-started": "Just getting going",
  "small-crew": "Small crew so far",
  "full-house": "Full house",
  "big-group": "Big group",
};

/**
 * M2 UI scaffolding strings — every label / heading / placeholder that
 * lives on a `/trips/new`, `/trips/[tripId]`, or `/invite/[token]` page
 * sources from this palette, NOT inline literals. Same voice rules as
 * EMPTY_STATES (warm, irreverent, specific; "would you say this at a
 * pre-trip dinner?"). Strings are kept short — under 120 chars so
 * the existing palette-length test covers them.
 *
 * Naming convention: `<surface>_<role>` (e.g. `newTrip_submit`,
 * `dashboard_section_rsvp_heading`). Greppable; collapses the surface
 * vs. semantic axes a future translator will care about.
 */
export const M2_UI_STRINGS = {
  // /trips/new
  newTrip_pageTitle: "Start a trip — Party Trip",
  newTrip_heading: "Start a trip",
  newTrip_nameLabel: "Name",
  newTrip_startLabel: "From",
  newTrip_endLabel: "To",
  newTrip_submit: "Lock it in",
  newTrip_vibePromptLabel: "What's the vibe?",
  // /trips/[tripId] dashboard
  dashboard_section_rsvp_heading: "Who's in",
  // #483 — small kicker over the viewer's own RSVP chips, same register
  // as the now/next card's "Right now"/"Up next" labels. The chips sit
  // under the group-scoped "Who's in" heading; without this they read
  // as a filter on the group, not a control for "you". Reused unmodified
  // from lib/copy per house rule (no inline literals).
  dashboard_rsvp_your_rsvp_label: "Your RSVP",
  // #483 — "Who's coming" (identical headcount to "Who's in") was
  // removed as a duplicate module; this footer link keeps the roster
  // reachable from the dashboard now that it was the only such link.
  dashboard_rsvp_roster_link: "See the full roster",
  dashboard_section_invite_heading: "Share the link",
  dashboard_section_invite_body:
    "Pop a link in the group chat. People click it, they're in.",
  dashboard_invite_placeholder:
    "Invite issuance UI ships next slice — mint links from the database for now.",
  dashboard_dates_unset: "Dates not locked in yet.",
  // /invite/[token]
  invitePreview_cta_authed: "Count me in",
  // #367: a member re-tapping the group-chat link is re-entering the
  // app, not joining — the accept CTA would lie ("I'm not in yet").
  // Voice: what the host would text back if you asked "wait, am I in?".
  invitePreview_cta_member: "You're in — open the trip",
  // #348: optional name capture at accept — no asterisk, no gate.
  invitePreview_name_label: "What should the crew call you?",
  invitePreview_name_placeholder: "First name works",
  /**
   * @deprecated 2026-07-11 incident fix — the anon lead-in above the
   * inline LoginForm is now the intent-aware pair
   * AUTH_COPY.inviteAuthHeaderCreate / inviteAuthHeaderSignIn (rendered
   * inside the form so it can follow the create/sign-in toggle). Kept so
   * the M2 key set stays stable; no app surface renders this.
   */
  invitePreview_cta_anon: "Sign in to join",
  invitePreview_back_link: "Back home",
  invitePreview_dates_unset: "Dates TBD",
  // /trips/[tripId] — RSVP 3-state chips (#74). "Can't make it" is the
  // voice-tested decline label; never "Declined" (corporate SaaS) per
  // notes/research/persona-edge-attendees.md (opt INTO participation,
  // never frame as a clinical no).
  rsvp_chip_going: "Going",
  rsvp_chip_maybe: "Maybe",
  rsvp_chip_declined: "Can't make it",
  // /trips/[tripId] — glanceable count templates. Simple {placeholder}
  // substitution; we don't pull in a full i18n lib for this. The
  // organizer-only declined suffix is gated at the call site by an
  // `is_trip_organizer()` RPC check — per the declining-whispers ADR,
  // non-organizers never see per-name decline data.
  dashboard_rsvp_count_template: "{going} going, {maybe} maybe, {invited} invited",
  dashboard_rsvp_count_declined_suffix: " ({count} can't make it)",
  // /trips/[tripId] — link to the dates page (Wave 3 #75 #76). The
  // "locked" variant fires once the dates are decided (#369): the poll
  // is archived and the CTA stops inviting a decision that's already
  // been made.
  dashboard_dates_link_label: "Pick the dates",
  dashboard_dates_link_label_locked: "See the dates",
  // /trips/[tripId]/dates — celebrant-weighted poll (Wave 3 #75 #76).
  // Voice test: would I say this out loud at the pre-trip dinner?
  // Mark labels are the celebrant's own voice; vote labels are a
  // member's. "Hard pass" because we don't want clinical SaaS
  // ("Reject"); "I'm in" / "Skip me" because they sound human.
  datePoll_heading: "Pick the dates",
  datePoll_celebrant_subhead:
    "You tell us what works. Everyone else votes on what's left.",
  datePoll_member_subhead: "Vote on the windows still in play.",
  datePoll_celebrant_chip_works: "Works",
  datePoll_celebrant_chip_works_with_effort: "Could work",
  datePoll_celebrant_chip_no_go: "Hard pass",
  datePoll_member_vote_yes: "I'm in",
  datePoll_member_vote_no: "Skip me",
  datePoll_add_window_cta: "Add a window",
  datePoll_max_windows_reached:
    "4 windows is the cap — drop one before adding.",
  datePoll_celebrant_unmarked_badge: "Celebrant hasn't weighed in",
  datePoll_celebrant_effort_badge: "Could work for the celebrant",
  // #482: the positive verdict rendered no badge at all — a
  // celebrant-approved window looked identical to one nobody had
  // weighed in on. Mirrors the "could work" register.
  datePoll_celebrant_works_badge: "Works for the celebrant",
  // Two empty-states (#369): the "drop one" invitation only ships to
  // someone who can actually drop one (organizer/celebrant — the ones
  // who see the add-window form). A plain member with no add affordance
  // gets a passive waiting line instead, so the copy never dangles an
  // action the screen doesn't render.
  datePoll_no_candidates_yet:
    "No windows proposed yet. Drop one and we'll start voting.",
  datePoll_no_candidates_member:
    "No windows yet — the organizers are still working out the dates.",
  // Decided state (#369): once an organizer locks a window, the poll is
  // archived and /dates shows the answer, not a live vote.
  datePoll_decided_heading: "The dates are set",
  datePoll_decided_subhead: "Block it off. This is when it's happening.",
  // Organizer-only lock-in affordance on each candidate window (#369).
  datePoll_lock_in_cta: "Lock it in",
  // #454: #210 two-step confirm — locking dates is the single most
  // consequential organizer action on this surface (writes
  // trips.starts_at/ends_at for the whole crew) and had LESS friction
  // than removing one roster member. First tap arms; the confirm names
  // the dates + the consequence, same idiom as roster remove/celebrant
  // unseat (see roster_manage_remove_confirm_template).
  datePoll_lock_in_confirm_template: "Lock {dates} for everyone? Voting closes.",
  datePoll_lock_in_never_mind: "Never mind",
  // #481: organizer-only delete affordance — quiet, not a big red
  // button. Simplest semantics per the DOGE review: only allowed while
  // the window has no votes yet (see errors.ts date_candidate_has_votes
  // for the blocked case). Same #210 two-step idiom as the lock-in CTA.
  datePoll_delete_cta: "Remove",
  datePoll_delete_confirm_template: "Remove {label}? It's gone for good.",
  datePoll_delete_never_mind: "Never mind",
  datePoll_add_form_label_label: "Window name",
  datePoll_add_form_start_label: "From",
  datePoll_add_form_end_label: "To",
  datePoll_add_form_submit: "Add it",
  datePoll_add_form_cancel: "Cancel",
  datePoll_unsynced_badge: "Syncing…",
  // Vote count + aria-label templates. Same `.replace()` pattern as
  // `dashboard_rsvp_count_template` — no full i18n lib for two strings.
  datePoll_vote_counts_template: "{yes} yes · {no} no",
  datePoll_vote_aria_label_template: "Vote on {label}",
  datePoll_mark_aria_label_template: "Mark for {label}",
} as const;

export type M2UIStringKey = keyof typeof M2_UI_STRINGS;

/**
 * M3 UI strings — itinerary, announcements, now/next card, FAQ/notes,
 * travel legs, roster, invite issuance UI. Same voice rules as M2.
 * Keys grouped by surface for greppability.
 *
 * Added in Wave 0a of the M3 execution plan. Read-only after this PR
 * for the remainder of M3 (per `notes/m3-execution-plan.md` Override
 * F — no inline string literals in JSX leaf elements).
 */
export const M3_UI_STRINGS = {
  // /trips/[tripId]/itinerary — day timeline (#35, Wave 2)
  itinerary_pageTitle: "Itinerary",
  itinerary_heading: "What's the plan",
  itinerary_addItem_cta: "Add an item",
  itinerary_day_section_template: "{weekday} · {date}",
  itinerary_item_dress_code_template: "Wear: {code}",
  itinerary_item_address_cta: "Open in Maps",
  itinerary_item_hidden_for_celebrant: "Something planned",
  itinerary_item_visibility_hide_celebrant_badge: "Hidden from {name}",
  // #405-B — generic fallback for the {name} slot when the celebrant's
  // display name can't be resolved. Keeps the badge readable ("Hidden from
  // the celebrant") without leaking the raw spec register into the common
  // (named) path. Shared by all three surfaces via hideFromCelebrantBadge().
  celebrant_generic_fallback: "the celebrant",
  // #480 — organizer-only gap-day note. Shown under a day heading when
  // every item that day is invisible to the celebrant (the day vanishes
  // from their view — they could double-book the slot). Micro-affordance,
  // not a gate: quiet heads-up in the organizer's read view. Same {name}
  // template + generic fallback as the hide-celebrant badge, via
  // celebrantGapDayNote().
  itinerary_day_gap_celebrant_note_template: "Looks wide open to {name}",
  // #508 — multi-day "continues" marker. Rendered on each intermediate
  // day a multi-day item spans (after its start day, up to and including
  // its end day), so a room booking or festival pass reads as ongoing
  // rather than vanishing after day one. {date} is the item's end day
  // (Mmm d). Dinner-table voice: a plain heads-up, not a status pill.
  itinerary_continues_marker_template: "{title} continues (through {date})",
  // #484 — now/next cue chips on the itinerary cards. Compact siblings of
  // the dashboard now/next card's "Right now"/"Up next" labels — shorter
  // because they sit inline on a card, not as a section kicker.
  itinerary_item_now_chip: "Now",
  itinerary_item_next_chip: "Up next",
  itinerary_item_kind_event: "Event",
  itinerary_item_kind_lodging: "Lodging",
  itinerary_item_kind_transport: "Transport",
  itinerary_item_kind_meal: "Meal",
  itinerary_item_kind_activity: "Activity",
  itinerary_rsvp_skip_chip: "Skip me",
  itinerary_rsvp_going_chip: "I'm in",
  itinerary_rsvp_inherited_caption: "Going by default",
  itinerary_item_flag_label: "Heads up to the organizers",
  itinerary_item_flag_placeholder: "Allergic, vegetarian, leaving early…",
  itinerary_item_flag_save: "Save the heads-up",
  itinerary_item_flag_saved: "Saved.",
  itinerary_item_flag_note_label: "Extra detail (optional)",
  itinerary_item_flag_note_placeholder: "More context for the organizers…",
  itinerary_item_flag_empty_organizer: "No heads-ups from anyone yet.",
  // #171 — organizer write-on-behalf + member confirm. The organizer
  // transcribes a heads-up a member volunteered out-of-band; the member
  // gets the final say. Voice test: what Dave would actually text.
  //   {name} = the organizer who saved it.
  itinerary_item_flag_onbehalf_confirm_template: "{name} saved this for you — keep it?",
  itinerary_item_flag_onbehalf_keep: "Keep",
  itinerary_item_flag_onbehalf_remove: "Remove",
  // Organizer-side entry (renders on the organizer's item view only).
  itinerary_item_flag_onbehalf_add_trigger: "Save a heads-up for someone",
  itinerary_item_flag_onbehalf_pick_person: "— Who's this for? —",
  itinerary_item_flag_onbehalf_save: "Save for them",
  //   {name} = the member it was saved for.
  itinerary_item_flag_onbehalf_saved_template: "Saved for {name}. They'll get the final say.",
  // Maps links
  itinerary_maps_apple: "Apple Maps",
  itinerary_maps_google: "Google Maps",
  // Edit item sheet CTA (organizer affordance on ItemCard)
  itinerary_edit_item_cta: "Edit",
  // Add-item / edit-item forms
  itineraryForm_title_label: "What is it?",
  itineraryForm_kind_label: "Kind",
  itineraryForm_starts_label: "Starts",
  itineraryForm_ends_label: "Ends",
  itineraryForm_address_label: "Where",
  itineraryForm_address_placeholder: "Street, city, or 'somewhere fun'",
  itineraryForm_dress_label: "Dress code (optional)",
  itineraryForm_tags_label: "Tags",
  itineraryForm_visibility_label: "Who sees this?",
  itineraryForm_visibility_everyone: "Everyone",
  itineraryForm_visibility_organizers: "Just organizers",
  itineraryForm_visibility_hide_celebrant: "Hide from the celebrant",
  itineraryForm_submit_add: "Add it",
  itineraryForm_submit_edit: "Save it",
  itineraryForm_delete: "Delete",
  itineraryForm_cancel: "Cancel",
  itineraryForm_delete_confirm: "Delete this item? Can't undo.",
  itineraryForm_tags_placeholder: "beach, nightlife, adventure",
  // #394: optional cost field. No asterisk (hard-banned) — the label
  // itself carries "(optional)" like the dress-code field above it.
  itineraryForm_cost_label: "Cost (optional)",
  itineraryForm_cost_placeholder: "45",
  // Validation messages (zod schema errors — user-visible)
  itineraryForm_validation_title_required: "Title is required",
  itineraryForm_validation_day_format: "Must be YYYY-MM-DD",
  itineraryForm_validation_cost_format: "Enter a dollar amount like 45 or 45.50",
  // #484: cross-field / trip-range checks — client-side only, mirrors the
  // dinner-table voice of the cost/title messages above (non-scolding).
  itineraryForm_validation_end_before_start: "That ends before it starts",
  itineraryForm_validation_day_out_of_range: "That's outside the trip dates",
  // #394: cost display on the card. Whole-dollar amounts render without
  // cents (formatCost); the per-head suffix only appears when 2+ people
  // are going. "if {count} in" mirrors the itinerary_rsvp_going_chip
  // voice ("I'm in") rather than "attending" or "confirmed."
  itinerary_item_cost_per_head_template: "{amount} · ~{perHead}/head if {count} in",
  // Lodging assignments (#36, Wave 2)
  lodging_assignments_heading: "Who's in which room",
  lodging_room_label_placeholder: "Master, bunk room, the loft, …",
  lodging_assign_cta: "Assign a room",
  lodging_unassign_cta: "Unassign",
  lodging_assign_pick_person: "— Pick a person —",
  // #556 — organizer-only "not yet set" bucket. Names an absence explicitly
  // (rule #8) instead of letting an omitted member read as handled. No count
  // in the heading, no "blocking" framing, alphabetical order only.
  lodging_unassigned_heading: "No room yet",
  // Now/next card (#77, Wave 3b)
  nowNext_pretrip_template: "Trip starts in {days}.",
  nowNext_today_label: "Today",
  nowNext_now_heading: "Right now",
  nowNext_next_heading: "Up next",
  nowNext_posttrip_template: "Trip wrapped {days} ago.",
  // #535 — was "Recap (coming soon)": Group Recap is deferred with no
  // milestone (killed-and-deferred.md, backlog #56), so "coming soon"
  // over-promised. Present tense, promises nothing; repoint if #56
  // ever ships.
  nowNext_posttrip_line: "Hope it was a good one.",
  nowNext_no_items_yet:
    "No items on the itinerary yet. Someone's about to fix that.",
  // Trip FAQ / notes (#78, Wave 3b)
  tripNotes_heading: "Stuff to know",
  tripNotes_edit_cta: "Edit",
  tripNotes_save_cta: "Save",
  tripNotes_cancel_cta: "Cancel",
  tripNotes_placeholder:
    "Hotel WiFi password, dress codes, who's bringing what — drop it here.",
  tripNotes_empty_member: "Nothing posted yet.",
  tripNotes_empty_organizer:
    "Drop the hotel wifi, dress codes, who's bringing what — anything worth pinning.",
  // Announcements (#79, Wave 3a)
  announcements_pageTitle: "Announcements",
  announcements_heading: "Announcements",
  announcements_compose_cta: "Post an update",
  announcements_compose_placeholder: "What's the update?",
  announcements_compose_visibility_label: "Who sees this?",
  announcements_compose_submit: "Send it",
  announcements_compose_cancel: "Cancel",
  announcements_member_only_caption: "Only you can post these.",
  // #389 reconcile — rule 11 affordance, not a gate: non-organizers see a
  // quiet reader line where organizers see the compose trigger, instead
  // of nothing at all.
  announcements_reader_only_caption:
    "Organizers drop updates here — an emoji back says you saw it.",
  // Announcement card badges (#79, Wave 3a fix-up — pulled from inline literals
  // per Override F after code-review HIGH finding)
  announcements_badge_pinned: "Pinned",
  announcements_badge_organizers_only: "Organizers only",
  announcements_badge_hide_celebrant: "Hidden from the celebrant",
  announcements_badge_custom: "Custom audience",
  // #470 compact-top relayout (2026-07-21) — collapsed composer trigger,
  // pinned-post banner, and the poll-link row that replaces the
  // in-feed decision-poll embed.
  announcements_pinned_banner_expand_aria: "Show the pinned post",
  announcements_pinned_banner_collapse_aria: "Hide the pinned post",
  announcements_pinned_banner_count_template: "{count} pinned posts",
  announcements_datePoll_link: "Dates are still up for a vote →",
  // #393 — organizer overflow menu (delete + pin/unpin). Two-tap confirm
  // in the dropdown itself, not a separate AlertDialog (see doge cut).
  announcements_menu_aria: "Post options",
  announcements_menu_pin: "Pin",
  announcements_menu_unpin: "Unpin",
  announcements_menu_edit: "Edit",
  announcements_menu_delete: "Delete",
  announcements_menu_delete_confirm: "Tap again to delete",
  // #544 — organizer inline body edit (fix a typo without deleting +
  // re-posting, which loses pin state/reactions/timestamp). No "edited"
  // indicator — operator decision.
  announcements_edit_body_label: "Edit the update",
  announcements_edit_save: "Save it",
  announcements_edit_cancel: "Cancel",
  // Travel legs / arrivals manifest (#37, Wave 4a)
  arrivals_pageTitle: "Arrivals",
  arrivals_heading: "Who's landing when",
  arrivals_addLeg_cta: "Add your travel",
  arrivals_leg_form_kind_label: "How",
  arrivals_leg_form_kind_flight: "Flight",
  arrivals_leg_form_kind_train: "Train",
  arrivals_leg_form_kind_drive: "Drive",
  arrivals_leg_form_kind_other: "Other",
  arrivals_leg_form_depart_label: "Leave",
  arrivals_leg_form_arrive_label: "Arrive",
  arrivals_leg_form_carrier_label: "Carrier",
  arrivals_leg_form_confirmation_label: "Confirmation #",
  // #505 — PNR is owner-only; say so honestly at the point of entry.
  arrivals_leg_form_confirmation_hint: "Just for you — the crew won't see this.",
  arrivals_leg_form_notes_label: "Notes",
  arrivals_leg_form_submit: "Save it",
  arrivals_leg_form_delete: "Delete travel",
  arrivals_empty: "Nobody's logged travel yet. Drop yours so we know when you land.",
  // Arrivals CTAs (Wave 4a fix-up — added so we don't reuse itineraryForm_* keys
  // cross-feature; voice-tested)
  arrivals_cancel_cta: "Cancel",
  arrivals_edit_cta: "Edit",
  arrivals_add_cta: "Add your travel",
  // #477 two-section travel model. A leg is inbound ("Getting there" —
  // you land AT the trip city) or outbound ("Heading home" — you take
  // off FROM the trip city). Each direction records only the trip-city-
  // side instant, so trip-timezone display is inherently correct — the
  // #382 "Times are {city} time" caption died with the old model.
  arrivals_add_inbound_cta: "Add a flight",
  arrivals_add_outbound_cta: "Add a return flight",
  // #574 follow-up — log a whole flight on another member's behalf. Add-mode
  // flight only; picking someone routes the leg to them (attributed, they
  // confirm) instead of creating your own.
  arrivals_leg_form_whose_label: "Whose flight is this?",
  arrivals_leg_form_whose_you: "Yours",
  arrivals_section_outbound_heading: "Heading home",
  arrivals_leg_form_airport_label: "Airport",
  arrivals_leg_form_origin_label: "Coming from",
  // #477 (supersedes #478's either-time gate): each direction requires
  // its trip-city-side instant.
  arrivals_leg_form_arrive_required:
    "When do you land? Drop the arrival in so we know when to expect you.",
  arrivals_leg_form_depart_required:
    "When do you take off? Drop the departure in so nobody plans around you.",
  // Inbound legs without a landing time (legacy rows) group under this.
  arrivals_inbound_time_tbd: "Landing time TBD",
  // #614 — outbound legs without a departure time group under this (mirrors
  // the inbound TBD bucket so departures day-group like arrivals).
  arrivals_outbound_time_tbd: "Departure time TBD",
  // #579 — compact chronological view. The toggle switches between the
  // dense one-line glance (Compact, default) and today's detail cards
  // (Full — the surface for editing / confirming / adding to a flight).
  arrivals_view_toggle_label: "Arrivals view",
  arrivals_view_toggle_compact: "Compact",
  arrivals_view_toggle_full: "Full",
  // Middot between the time and the name in a compact row (`9:50 pm · Rob`).
  arrivals_compact_separator: "·",
  // Ride-share nudge — one quiet computed line, no matching engine (#118
  // stays open). {count} distinct people, {airport} free text.
  arrivals_ride_share_template:
    "{count} of you land at {airport} within an hour — split a ride?",
  // #581 — outbound-phrased sibling (people leaving together share a ride TO
  // the airport). Same "split a ride?" close.
  arrivals_ride_share_template_outbound:
    "{count} of you fly out of {airport} around then — split a ride?",
  // Card origin label, inbound only. {origin} is free text ("JFK", "Ohio").
  arrivals_card_from_template: "from {origin}",
  // #574 — co-traveler tagging (shared flights). The picker on the add-a-
  // flight form; the tagged member confirms on their own arrivals view.
  arrivals_tag_cotravelers_label: "Anyone else on this flight?",
  arrivals_tag_cotravelers_hint:
    "It'll land on their arrivals too — they just confirm it's them.",
  // Shown on a still-pending tag. {name} = the member who added it. On
  // everyone else's view this is the whole story; on the tagged member's
  // own card it sits above the confirm buttons.
  arrivals_tag_pending_marker_template: "Added by {name} · unconfirmed",
  // The tagged member's confirm prompt. {name} = the tagger.
  arrivals_tag_confirm_heading_template: "{name} says you're on this flight.",
  arrivals_tag_confirm_cta: "Yep, that's me",
  arrivals_tag_dismiss_cta: "Not me",
  // #615 — organizer remove (Full card only, rule #11). Two-tap destructive
  // confirm mirrors announcements_menu_delete / _delete_confirm's tone.
  arrivals_organizer_remove: "Remove",
  arrivals_organizer_remove_confirm: "Tap again to remove",
  // #574 follow-up — per-card "add who's on this flight". Any member adds
  // others onto an already-logged flight straight from its card (no re-entry
  // — the flight's own details are reused); each added person confirms.
  addToFlight_trigger: "Add who's on this flight",
  addToFlight_label: "Who else is on it?",
  addToFlight_submit: "Add them",
  addToFlight_cancel: "Cancel",
  // #581 — ride groups. Recommend (the nudge CTA) → add who you're riding
  // with. No confirm gesture: added riders show "added by X" and opt out.
  rideGroup_startCta: "start a ride",
  // Persistent manual entry per direction (a ride with no cluster to seed).
  rideGroup_manualCta_inbound: "sorting out a ride from the airport?",
  rideGroup_manualCta_outbound: "sorting out a ride to the airport?",
  // Card heading. {airport} free text; TBD fallback when airport is blank.
  rideGroup_card_heading_inbound: "ride from {airport}",
  rideGroup_card_heading_outbound: "ride to {airport}",
  rideGroup_card_heading_inbound_tbd: "ride from the airport",
  rideGroup_card_heading_outbound_tbd: "ride to the airport",
  // Provenance on an added rider row. {name} = who added them. Quiet, never
  // an alarm — a ride tag is provisional, not an error (no "waiting on X").
  rideGroup_added_by_template: "added by {name}",
  // Row + card controls.
  rideGroup_leave: "leave",
  rideGroup_remove: "clear this ride",
  rideGroup_addRiders_trigger: "add riders",
  rideGroup_addRiders_label: "Who else is riding?",
  rideGroup_addRiders_submit: "Add them",
  rideGroup_cancel: "Cancel",
  // Start-a-ride sheet.
  rideGroup_sheet_title: "Start a ride",
  rideGroup_sheet_airport_label_inbound: "From",
  rideGroup_sheet_airport_label_outbound: "To",
  rideGroup_sheet_riders_label: "Who's riding?",
  rideGroup_sheet_submit: "Start ride",
  // Compact glance line token (mono register — NEVER an emoji) + self label.
  rideGroup_compact_token: "ride",
  rideGroup_self_label: "You",
  // Roster + contacts (#39, #40, Wave 4b)
  roster_pageTitle: "Roster",
  // #533 — the roster deliberately lists ALL members (including "Can't
  // make it" rows), so the heading is the neutral directory register,
  // not an RSVP claim. Presence word register: in = RSVP, landed =
  // arrivals, around = day-level presence (notes/design-system.md).
  roster_heading: "The crew",
  roster_vcard_cta: "Download contacts",
  roster_copy_numbers_cta: "Copy all numbers",
  roster_copy_numbers_done: "Copied — paste into iMessage.",
  roster_no_numbers: "No phone numbers in the roster yet.",
  // Roster member fallback + role labels (Wave 4b fix-up — inline JSX
  // literals flagged in code review)
  roster_member_fallback_name: "Guest",
  // Own-row affordance (#F5-partial, issue #348 tracks the full identity-
  // capture fix) — the signed-in user's own roster row, regardless of
  // whether display_name is set.
  roster_member_you: "You",
  roster_role_celebrant: "celebrant",
  roster_role_organizer: "organizer",
  roster_role_co_organizer: "co-organizer",
  // Invite issuance UI (#129, Wave 4c)
  invitesPage_pageTitle: "Invite links",
  invitesPage_heading: "Invite links",
  invitesPage_create_cta: "Mint a link",
  // {remaining} = current uses_left. Schema doesn't track an original max
  // (only the remaining count), so "{remaining} of {total}" would misreport.
  invitesPage_uses_template: "{remaining} left",
  invitesPage_expires_template: "Expires {when}",
  invitesPage_copy_link_cta: "Copy link",
  invitesPage_copied: "Copied — paste in the group chat.",
  invitesPage_revoke_cta: "Revoke",
  invitesPage_revoke_confirm: "Revoke this link? Anyone with it can't join.",
  // #385 — muted status label on revoked / expired / used-up links. One
  // label for all three: the organizer doesn't need forensics, just
  // "don't paste this one in the group chat". Voice: what you'd actually
  // say ("that link's dead"), not a SaaS badge ("INACTIVE").
  invitesPage_dead_label: "Link's dead — mint a fresh one.",
  invitesPage_empty: "No links out yet. Mint one and start texting it around.",
  invitesForm_max_uses_label: "Max uses",
  invitesForm_max_uses_placeholder: "Leave blank for no cap",
  invitesForm_expires_label: "Expires",
  invitesForm_expires_placeholder: "Leave blank for no expiry",
  invitesForm_submit: "Mint it",
  invitesForm_cancel: "Cancel",
  // Wave 0 trip-readiness additions — 5 new keys (consumers in W1/W2)
  // announcements_author_fallback: shown when a post author can't be resolved
  announcements_author_fallback: "Someone",
  // crew_invite_cta: CTA to add someone to the trip crew
  crew_invite_cta: "Add to the crew",
  // nav_account_trips_link: nav link label for the user's trips list
  nav_account_trips_link: "Your trips",
  // nav_brand_label: the app name as it appears in the nav/header
  nav_brand_label: "Party Trip",
  // tripsList_newTrip_cta: CTA to start a new trip from the trips list
  tripsList_newTrip_cta: "Start a trip",
  // identifier_copy / identifier_copied: the <Identifier> primitive's
  // copy-on-tap affordance — idle label and post-copy confirmation.
  // Deliberately shorter than invitesPage_* because Identifier is a generic
  // primitive, not invite-specific.
  identifier_copy: "Copy",
  identifier_copied: "Copied",
} as const;

export type M3UIStringKey = keyof typeof M3_UI_STRINGS;

/**
 * M4 UI strings — itinerary item chip pickers (dress code, activity tags,
 * member flags) and travel-leg airline input. Same voice rules as M3.
 * Keys grouped by surface for greppability.
 *
 * Voice-locked per Override H — these strings are the source of truth for
 * every later wave. Change here = change everywhere.
 *
 * Naming: `<surface>_<role>` (consistent with M2/M3 convention).
 */
export const M4_UI_STRINGS = {
  // Itinerary item — member-flag picker (per-item, organizer-visible only)
  // Override H voice locks — exact strings pinned in lib/copy/__tests__/m4-voice-locks.test.ts
  itineraryItem_memberFlag_heading: "Anything we should know?",
  itineraryItem_memberFlag_subhead:
    "Just for the organizer — private to you.",
  // Freeform custom-flag entry (#398) — label doubles as the placeholder;
  // separate keys so they can diverge without touching call sites.
  itineraryItem_memberFlag_freeform_label: "Anything else?",
  itineraryItem_memberFlag_freeform_placeholder: "Anything else?",
  itineraryItem_memberFlag_freeform_add: "Add",
  // Itinerary item — dress-code chip picker
  itineraryItem_dressCode_placeholder: "Pick a vibe or type your own",
  // Itinerary item — activity-tag chip picker
  itineraryItem_activityTag_placeholder: "Add a tag",
  // Travel leg — airline typeahead
  // Voice lock: matches arrivals_leg_form_carrier_label palette tone.
  travelLeg_airline_placeholder: "Type your airline",
  travelLeg_airport_placeholder: "Type your own",
  // /me page — W0d skeleton (no completion UI per Voice CRITICAL C1)
  me_page_heading: "You",
  me_label_name: "Name",
  me_label_email: "Email",
  me_sign_out_cta: "Sign out",
  me_display_name_fallback: "Crew member",
  // RSVP chip + aggregate aria-labels (#45, Wave 3b).
  // Voice test: warm, specific — "Yep", "Maybe", "Can't" per Party Trip tone.
  // These are NOT color-only signals; icons + aria-labels carry the state.
  rsvp_chip_aria_going: "Yep — going",
  rsvp_chip_aria_maybe: "Maybe — not sure yet",
  rsvp_chip_aria_declined: "Can't make it",
  rsvp_chip_aria_no_response: "No answer yet",
  // Aggregate icon+count aria-labels for the count display.
  rsvp_aggregate_aria_going: "going",
  rsvp_aggregate_aria_maybe: "maybe",
  rsvp_aggregate_aria_declined: "can't make it",
  rsvp_aggregate_aria_no_response: "no answer yet",
} as const;

export type M4UIStringKey = keyof typeof M4_UI_STRINGS;

/**
 * M5-era strings — expenses MVP (#372). Voice rule unchanged: would you
 * say it out loud at a pre-trip dinner? No shame-coding, no nudges —
 * passive-aggressive payment pressure is hard-banned (CLAUDE.md).
 */
export const M5_UI_STRINGS = {
  expenses_heading: "Who paid for what",
  expenses_total_label: "So far",
  expenses_your_share_label: "Your share",
  expenses_paid_by_template: "{name} covered it",
  expenses_add_cta: "Log a spend",
  expensesForm_description_label: "What was it?",
  expensesForm_description_placeholder: "Boat deposit, first round, gas…",
  expensesForm_amount_label: "How much?",
  expensesForm_amount_placeholder: "120 or 120.50",
  expensesForm_date_label: "When? (today if blank)",
  expensesForm_split_label: "Who's splitting it?",
  // #391 — split-chip attendance notes. Surface the stored RSVP right
  // where the money splits (rule 8: don't assume everyone's in). Plain
  // statements of fact, zero nudge — you'd say any of these across the
  // dinner table while pointing at the tab.
  expensesForm_split_note_maybe: "said maybe",
  expensesForm_split_note_declined: "not coming",
  expensesForm_split_note_pending: "hasn't said yet",
  expensesForm_visibility_label: "Who sees this?",
  expensesForm_submit: "Log it",
  expensesForm_cancel: "Never mind",
  // #383 — correctable money. Edit/delete on the expense card. Same
  // voice test; delete confirm is two-step (tap again), so it asks the
  // question out loud instead of raising a modal.
  expenses_edit_cta: "Edit",
  // #467 — split membership was only visible to the payer/organizer via
  // the edit sheet. "Who's in" line renders for every viewer; "you"
  // sorts first when the viewer is included, matter-of-fact "not in
  // this one" when they aren't (rule 8 tone — no accusation, no nudge).
  expenses_split_ways_template: "Split {count} ways — {names}",
  expenses_split_you_label: "you",
  expenses_split_more_template: "+{count} more",
  expenses_split_not_in_this_one: "You're not in this one",
  expensesForm_submit_edit: "Save it",
  // Edit-sheet date semantics differ from add ("today if blank" would
  // be a lie — a cleared date keeps the stored one), so it gets its own
  // truthful label.
  expensesForm_date_label_edit: "When?",
  expensesForm_delete: "Delete",
  expensesForm_delete_confirm: "Take this off the tab? Can't undo.",
  // #389 — announcement reactions (the ack loop). Aggregate-only surface:
  // counts, never names. The emoji carry the voice; copy here is
  // aria-only so screen readers get a warm, specific action label.
  // {emoji} is interpolated via .replace at the call site (same pattern
  // as itinerary_day_section_template).
  reactions_add_aria: "Add a reaction",
  reactions_picker_aria: "Pick a reaction",
  reactions_toggle_aria_template: "React with {emoji}",
  // #390 — generic poll primitive ("Put it to the crew" register).
  // Same voice test. No leaderboard framing on tallies — counts are
  // aggregate-only and stated plainly.
  polls_composer_cta: "Put it to the crew",
  pollsForm_question_label: "The question",
  pollsForm_question_placeholder: "Steakhouse or omakase?",
  pollsForm_option_label_template: "Option {n}",
  pollsForm_add_option: "Add another option",
  pollsForm_closes_label: "Last call for votes? (fine to leave open)",
  pollsForm_visibility_label: "Who sees this?",
  pollsForm_submit: "Ask the crew",
  pollsForm_cancel: "Never mind",
  polls_vote_count_one: "1 vote in",
  polls_vote_count_other: "{count} votes in",
  polls_closes_template: "Closes {date}",
  polls_closed_label: "Voting's closed",
  // #532 — disclosure row label when polls exist but every one is
  // closed. Results-flavored: the row's job here is access to
  // outcomes, not a vote prompt.
  polls_all_closed_label: "How the votes landed",
  polls_closed_winner_template: "{label} takes it",
  polls_closed_tie: "Dead heat. Sort it out over a drink.",
  polls_closed_no_votes: "Nobody weighed in. Organizer's call.",
  polls_option_vote_aria_template: "Vote {label}",
  // #620 — flat comment thread on polls (part 1/3 of #616). Same shape
  // as the shopping-list Notes thread (notesHeading/notePlaceholder/
  // etc.), reused word-for-word where the register is identical.
  polls_comments_heading: "Comments",
  polls_comment_placeholder: "Add a comment…",
  polls_comments_empty: "Nothing here yet. Weigh in.",
  polls_comment_author_line_template: "{name} · {when}",
  polls_comment_delete_cta: "Remove",
  polls_comment_delete_aria: "Delete comment",
  polls_comment_delete_confirm: "Remove this comment? Can't undo.",
  polls_comment_composer_submit_aria: "Send comment",
  // #621 — poll write-in options (part 2/3 of #616). A quiet "add your
  // own" affordance under the option list, open-poll-only. Precise,
  // not cute (per feedback: functional state-machine copy wants exact
  // labels over vague hype).
  // No separate submit aria-label: the button's visible text ("Add
  // your own option") already yields a fine accessible name — an
  // aria-label that doesn't contain the visible label would violate
  // WCAG 2.5.3 (label-in-name).
  polls_writein_add_cta: "Add your own option",
  polls_writein_placeholder: "Type an option…",
  // {name} interpolated via .replace, same pattern as
  // polls_comment_author_line_template. Renders ONLY on write-ins —
  // organizer-composed options show no attribution line.
  polls_writein_suggested_by_template: "Suggested by {name}",
  // #387 — quiet per-name RSVP chips on the roster. Factual state only —
  // the anti-shame boundary is BINDING: no lateness ordering, no nudge
  // copy, no counts of shame. "going" deliberately has NO chip string
  // (the default row stays unmarked). "No answer yet" for pending RSVP
  // (#503 — member accepted invite but hasn't responded).
  roster_chip_maybe: "Maybe",
  roster_chip_invited: "No answer yet",
  // Matches the dashboard's organizer-only declined register
  // ("can't make it") — the view decides who gets to see it.
  roster_chip_declined: "Can't make it",
  // #386 — organizer member management (quiet overflow → inline panel).
  // Rule 11: micro-affordances, not admin-panel vibes. The remove confirm
  // names the object + consequence per the #210 destructive contract.
  roster_manage_aria_template: "Manage {name}",
  roster_manage_make_co: "Make co-organizer",
  roster_manage_back_to_crew: "Back to crew",
  roster_manage_remove: "Remove from trip",
  roster_manage_remove_confirm_template:
    "Remove {name} from the trip? They'd need a new invite to get back in.",
  roster_manage_close: "Never mind",
  // #368 / #262 (name half) — self-service /me profile editor. Rule 8:
  // phone is opt-IN — no asterisk, no completion pressure, and the hint
  // names the ONE real reason to add it (the roster's contact download,
  // i.e. day-of texts). NOT a "complete your profile" surface — that
  // pattern is hard-banned.
  meProfile_edit_cta: "Edit",
  meProfile_edit_aria: "Edit your name and phone",
  meProfile_heading: "What should the crew call you?",
  meProfile_name_label: "Name",
  meProfile_phone_label: "Phone — only if you want",
  meProfile_phone_hint:
    "Goes in the roster's contact download so the crew can text you day-of.",
  meProfile_phone_placeholder: "+1 415 555 1212",
  meProfile_submit: "Save it",
  meProfile_cancel: "Never mind",
  // /me — phone row label (sits beside the M4 me_label_name/email pair)
  me_label_phone: "Phone",
  // Celebrant assignment — FOUNDER-only items in the same overflow
  // panel. Register matches the guard copy ("guest of honor"). The
  // reassign confirm is #210 two-step (it displaces the current
  // holder); a first-ever assignment commits in one tap. Clearing gets
  // the same two-step since it also unseats a current holder.
  roster_manage_make_celebrant: "This trip's for them",
  roster_manage_celebrant_reassign_confirm_template:
    "Make {name} the guest of honor? {current} steps back into the crew.",
  roster_manage_clear_celebrant: "Back into the crew",
  roster_manage_celebrant_clear_confirm_template:
    "{name} rejoins the crew — no guest of honor until you pick one.",
} as const;

/**
 * #388 — day-scoped attendance strings. Voice rule unchanged: would you
 * say it out loud at a pre-trip dinner?
 *
 * Rule-8 framing is load-bearing here: the chips ask which days you're
 * AROUND — the member opts into days, nobody is assumed-in. No nudge,
 * no "complete your attendance" pressure; "change it whenever" keeps it
 * a zero-stakes tap.
 */
export const MEMBER_DAYS_UI_STRINGS = {
  // /me — day chips under the profile card
  memberDays_heading: "Which days are you around?",
  memberDays_subhead: "Tap yourself in or out. Change it whenever.",
  // Screen-reader label for the chip group (the visible heading is the
  // section h2; the group repeats it for AT users who land on the group).
  memberDays_group_aria: "Which days are you around?",
  // Roster — per-day presence block (#524: visible to all members, day
  // tokens expand to names).
  memberDays_headcount_heading: "Who's around when",
  // Screen-reader expansion of the mono "thu 8 · fri 12" line — the
  // compact register is ambiguous read aloud ("thu 8" could be a date).
  memberDays_headcount_day_aria_template: "{count} in on {day}",
  // #524 — day tokens expand to names; empty state replaces null.
  memberDays_headcount_empty: "No one's marked their days yet.",
  // Leg annotations on the expanded names — trip-local times.
  memberDays_leg_lands_template: "lands {time}",
  memberDays_leg_leaves_template: "leaves {time}",
  // #552 — organizer-only marker on an expanded name whose member has NO
  // trip_member_days row for that day (the seed trigger only fans out rows
  // for going members, so a maybe/pending member who never opened /me shows
  // no row). Distinguishes "hasn't set anything" from "explicitly not that
  // day" — rule #8 (name the absence, don't let it read as a default).
  // Factual, not a nag: no count, no lateness, no one-tap nudge.
  memberDays_not_set_note: "hasn't set days",
  // Glanceability sweep — reciprocal one-line text links between the
  // /me day-chips editor and the roster DayHeadcount block. Plain
  // wayfinding, no nudge: neither line implies you're behind on anything.
  memberDays_link_to_headcount: "See who's around when",
  memberDays_link_to_editor: "Set which days you're around",
  // #534 — trip-declined viewers don't get the chips (every read
  // surface excludes declined members' day rows per #475, so the form
  // would be write-only). Warm redirect, not a gate message — the RSVP
  // toggle lives on the trip dashboard.
  memberDays_declined_line:
    "You're out for this one. If plans change, flip your RSVP and the day picker comes back.",
  // #550 — organizer sets a member's days on their behalf (the "Rob texted
  // me his dates" case). Organizer-only surface on the roster; recording
  // what a member said, never assuming. Voice: plain, helpful, no nag.
  memberDays_onbehalf_trigger: "Set someone's days",
  memberDays_onbehalf_pick_person: "Who told you their dates?",
  memberDays_onbehalf_heading_template: "Marking days for {name}",
  memberDays_onbehalf_hint:
    "They'll see you set these on their page and can change them.",
  // #550 — /me cue when an organizer set some of your days. Marks the
  // provenance; the member's own tap on any chip re-asserts ownership.
  memberDays_organizer_set_cue:
    "An organizer marked the highlighted days from what you told them. Tap any to change it.",
  // Screen-reader suffix on an organizer-set chip.
  memberDays_organizer_set_marker_aria: "set by an organizer",
} as const;

export type MemberDaysUIStringKey = keyof typeof MEMBER_DAYS_UI_STRINGS;

/**
 * #549 — organizer-sent RSVP confirm-prompt. An organizer relays what a
 * member told them offline; the member confirms with their own tap (which
 * is the only thing that ever writes the real RSVP). Voice: warm, no nag —
 * the member is doing the organizer a favor by confirming, not being chased.
 */
export const RSVP_CONFIRM_PROMPT_UI_STRINGS = {
  // Member-facing banner (on the dashboard, above the RSVP toggle). One per
  // proposed status; {sender} is the organizer's name.
  rsvpPrompt_banner_going: "{sender} heard you're in — that right?",
  rsvpPrompt_banner_maybe: "{sender} heard you're a maybe — that right?",
  rsvpPrompt_banner_declined:
    "{sender} heard you're sitting this one out — that right?",
  // Fallback when the sender has no display name yet.
  rsvpPrompt_sender_fallback: "An organizer",
  // The optional note the organizer attached.
  rsvpPrompt_note_template: "They added: {note}",
  rsvpPrompt_confirm_cta: "Yep, that's me",
  rsvpPrompt_dismiss_cta: "Not quite",
  // Organizer-facing sender (on the roster). Collapsible, mirrors the
  // day-on-behalf panel.
  rsvpPrompt_send_trigger: "Confirm someone's RSVP",
  rsvpPrompt_send_pick_person: "Who did you hear from?",
  rsvpPrompt_send_status_label: "What did they say?",
  rsvpPrompt_send_status_going: "They're in",
  rsvpPrompt_send_status_maybe: "They're a maybe",
  rsvpPrompt_send_status_declined: "They're out",
  rsvpPrompt_send_note_placeholder: "Add a note (optional)",
  rsvpPrompt_send_cta: "Send the confirm",
  rsvpPrompt_send_hint:
    "They'll get a one-tap confirm — you're not setting it for them.",
  rsvpPrompt_send_sent_template: "Asked {name} to confirm.",
} as const;

export type RsvpConfirmPromptUIStringKey =
  keyof typeof RSVP_CONFIRM_PROMPT_UI_STRINGS;

/**
 * #525 — post-save leg→day-chip suggestion prompt ("suggest, don't
 * write"). One quiet question after a travel leg saves; one tap
 * applies, "Leave it" means never ask again for this leg version.
 * Register: {day}/{range} arrive pre-formatted in the day-header
 * register ("fri 14", "fri 14 – tue 18").
 */
export const LEG_DAY_SUGGEST_UI_STRINGS = {
  legDaySuggest_inbound_template: "You land {day} — mark {range} as around?",
  legDaySuggest_outbound_template:
    "You head out {day} — clear the days after?",
  legDaySuggest_apply_inbound: "Mark it",
  legDaySuggest_apply_outbound: "Clear them",
  legDaySuggest_dismiss: "Leave it",
} as const;

export type LegDaySuggestUIStringKey =
  keyof typeof LEG_DAY_SUGGEST_UI_STRINGS;

/**
 * #526 — quiet inline cue when your day chips contradict your own
 * travel legs. Chips win; the cue never nags, never names anyone else.
 * {day} arrives pre-formatted in the day-header register ("fri 14").
 */
export const LEG_DAY_CONFLICT_UI_STRINGS = {
  legDayConflict_lands_template:
    "heads up — you land {day} but aren't marked around",
  legDayConflict_leaves_template:
    "heads up — you leave {day} but aren't marked around",
  legDayConflict_after_template:
    "heads up — you leave {day} but you're still marked around after",
} as const;

export type LegDayConflictUIStringKey =
  keyof typeof LEG_DAY_CONFLICT_UI_STRINGS;

/**
 * Dashboard-header trip edit (name + location + — as of #476 — dates,
 * but ONLY once a trip already has dates). Rule 11: the trigger is an
 * organizer micro-affordance — non-organizers never see it, so there is
 * no locked/disabled register here. An undated trip still doesn't get
 * date fields here: the /dates poll flow is the only way to *set*
 * dates for the first time; this sheet only ever corrects a window
 * that's already locked in.
 */
export const TRIP_EDIT_UI_STRINGS = {
  tripEdit_cta: "Edit",
  // Screen-reader expansion of the small "Edit" trigger next to the h1.
  tripEdit_cta_aria: "Edit trip name and location",
  tripEdit_name_label: "Trip name",
  tripEdit_location_label: "Where's it happening?",
  tripEdit_location_placeholder: "City, house, boat…",
  // #476 — dates section, gated to trips that already have dates set.
  tripEdit_startLabel: "From",
  tripEdit_endLabel: "To",
  // Quiet caution line under the date fields — no confirm dialog (an
  // explicit-save sheet is deliberate enough), just a heads-up that this
  // isn't a draft.
  tripEdit_dates_caution: "Everyone sees the new dates the moment you save.",
  tripEdit_submit: "Save it",
  tripEdit_cancel: "Never mind",
} as const;

export type TripEditUIStringKey = keyof typeof TRIP_EDIT_UI_STRINGS;

/**
 * Shopping list UI strings (PR1) — the dedicated arrivals-style list for
 * shared coordination. Same voice rules as every palette (warm, irreverent,
 * specific). Strings are kept short and greppable.
 *
 * Naming: `<element>` (e.g., `heading`, `addCta`, `claimCta`) — no
 * `surface_role` prefix since all keys are scoped under the feature.
 */
export const SHOPPING_LIST_UI_STRINGS = {
  heading: "Shopping list",
  addCta: "What do we need?",
  nameLabel: "What is it?",
  namePlaceholder: "e.g. 2 handles of tequila",
  costLabel: "Rough cost (optional)",
  categoryLabel: "Category (optional)",
  // gap-C — cost tag template; `formatCents` produces the amount, this
  // template supplies the "roughly" framing. Never `formatCost` (that
  // one appends the banned per-head `~$X/head` split).
  costTag_template: "~{amount}",
  surpriseToggle_template: "Surprise — hide from {name}",
  categorySnacks: "snacks",
  categoryBooze: "booze",
  categorySupplies: "supplies",
  categoryGear: "gear",
  submitCta: "Add it",
  cancelCta: "Never mind",
  deleteCta: "Remove",
  // P2-T5 — row social affordances. openDetail_template drives the
  // whole-row-tap aria-label (a11y name for the overlay button); likeAria
  // is a static label (aria-pressed communicates the toggle state, so no
  // template needed).
  openDetail_template: "Open {name}",
  likeAria: "Like",
  // P2-T6 — detail bottom sheet (ShoppingItemSheet). Header, reaction
  // strip, Notes thread, composer, and dismiss copy. Neutral per-pill
  // reaction aria-labels live in `lib/reactions/shopping-constants.ts`
  // (SHOPPING_REACTION_ARIA) — tied 1:1 to the emoji set, not duplicated
  // here.
  sheetClose_aria: "Close",
  addedBy_template: "Added by {name} · {when}",
  reactionsGroup_aria: "React to this item",
  notesHeading: "Notes",
  notePlaceholder: "Add a note…",
  notesEmpty:
    "Nothing here yet. Drop a note if there's something the buyer should know.",
  noteAuthorLine_template: "{name} · {when}",
  noteDelete_aria: "Delete note",
  noteDeleteConfirm: "Remove this note? Can't undo.",
  noteComposerSubmit_aria: "Send note",
  // Distinct from the plain `deleteConfirm` above — surfaced when the item
  // being removed carries at least one comment or reaction, so the cascade
  // cost is named up front instead of a generic "can't undo".
  itemDeleteConfirm:
    "Remove this? It'll take its reactions and notes with it — can't undo.",

  // --- v2 lifecycle ---
  // v2 lifecycle — state labels (reused for filter tabs, section
  // dividers, and the Open status line). Precise/literal beats warm/cute
  // here (see feedback_precise_copy_over_cute) — this is a coordination
  // state machine, not a celebratory surface. Verb spine: complete.
  stateOpen: "Open",
  stateInProgress: "In-progress",
  stateCompleted: "Completed",
  stateRemoved: "Removed",
  filterAll: "All",
  // v2 action buttons (one primary per state)
  completeAction: "Completed",
  claimSelfAction: "I'll complete",
  assignAction: "Assign…",
  reassignAction: "Re-assign…",
  reopenAction: "Re-open",
  // v2 attributed status lines
  completedBy_template: "Completed by {name}",
  removedBy_template: "Removed by {name}",
  inProgressYou: "You to complete",
  inProgressThem_template: "{name} to complete",
  // v2 assign/re-assign picker + provenance
  assignOpenNoOne: "Open — no one",
  assignedByProvenance_template: "{assigner} put {assignee} on this",
  // v2 row overflow menu (Task 5a) — trigger aria-label + the two-tap
  // purge item. Soft Remove reuses `deleteCta`; the purge confirm label
  // reuses `itemDeleteConfirm` (same cascade-cost copy as the old
  // window.confirm dialog).
  itemMenu_aria: "Item options",
  menuPurge: "Delete permanently",
  // v2 pickers + reopen-with-note flow (Task 5b). Precise/literal, same
  // register as the rest of the lifecycle strings — this is a picker
  // title, not a prompt.
  completedByPickerTitle: "Completed by…",
  reopenNotePlaceholder: "Add a note (optional)…",
  // Task 6 — segmented filter + sectioning. `completeAction` above is
  // literally "Completed", which collides with the Completed section
  // divider's own visible label as an accessible name — this template
  // gives the divider/toggle button a distinct one ("Show/hide
  // Completed") so screen-reader users (and role-based queries) can tell
  // the two apart. {section} is stateCompleted or stateRemoved.
  sectionToggle_aria_template: "Show/hide {section}",
  // Small neutral line for an empty FILTERED tab (e.g. no Removed items
  // yet) — distinct from EMPTY_STATES.shopping_list_empty, which only
  // fires when there are ZERO items total.
  filterTab_emptyNote: "Nothing here for this filter.",

  // Task 7a — fast multi-add (Enter-to-continue + paste-split) and the
  // "Add with details" demotion of the full form. `addCta` stays put on
  // `SHOPPING_LIST_UI_STRINGS` (Task 8 owns copy retirement) even though
  // it's no longer referenced from the trigger — `addDetailsCta` replaces
  // it there. `cancelCta` is reused for the paste-confirm's cancel action
  // (no dedicated key — same "Never mind" register).
  quickAddPlaceholder: "Add an item…",
  pasteAddConfirm_template: "Add {count} items?",
  // Confirm button for the paste-split gate above. Distinct from the
  // singular `submitCta` ("Add it") — the paste dialog adds N items, so the
  // plural "Add them" reads truer under "Add {count} items?".
  pasteAddConfirmCta: "Add them",
  addDetailsCta: "Add with details",

  // Task 7b — inline amend/edit (name/category/cost) in the detail sheet.
  // `cancelCta` is reused for the edit form's cancel action.
  editCta: "Edit",
  editSave: "Save",
} as const;

export type ShoppingListUiStringKey = keyof typeof SHOPPING_LIST_UI_STRINGS;

/**
 * Dashboard glance lines (glanceability sweep) — the muted one-line
 * facts under each dashboard link-card title. Same voice test as every
 * palette. Hard boundary: these are FACTS in text-muted-foreground,
 * never badges / unread dots / counts styled as notifications
 * (CLAUDE.md hard-bans). Templates use the `.replace("{x}", …)` pattern
 * shared with M2/M3.
 *
 * Card empty states reuse the page-level `EMPTY_STATES` /
 * `M3_UI_STRINGS.arrivals_empty` strings so the two surfaces never say
 * different things about the same silence.
 */
export const DASHBOARD_GLANCE_STRINGS = {
  // Itinerary card — items exist but the last one is already behind us
  // (the true "nothing booked" case reuses EMPTY_STATES.itinerary).
  glance_itinerary_wrapped: "That's a wrap — nothing left on the plan.",
  // Arrivals card. {when} is "Sat 2:00 pm" (trip-tz, lowercase am/pm).
  glance_arrivals_landed_next_template: "{landed} landed · next {when}",
  // #533 — the claim is scoped to LOGGED travel only: the universe is
  // inbound legs with an arrive_at, not the roster. "everyone's in" was
  // false whenever some of the crew never logged a flight.
  glance_arrivals_all_landed_template:
    "{landed} landed — all logged travel is in",
  glance_arrivals_first_template: "First one lands {when}",
  // Expenses card — the viewer's OWN net position only. A who-owes-who
  // list is killed scope (notes/killed-and-deferred.md); never widen this.
  glance_expenses_up_template: "You're up {amount}",
  glance_expenses_down_template: "You're down {amount}",
  glance_expenses_even: "All square so far",
  // Invites card (organizer-only) — live link count, stated plainly.
  glance_invites_one: "1 link out",
  glance_invites_other_template: "{count} links out",
  // #536 — zero-LIVE state. Not EMPTY_STATES.invites_for_trip ("No
  // links out yet…"): the dashboard counts live invites only, while
  // the invites list keeps revoked rows visible as an audit trail —
  // "yet" would contradict that list after a mint-then-revoke.
  glance_invites_none_live: "No live links right now",
  // Announcements card — open-poll discoverability line (polls live on
  // the announcements page; non-organizers had no way to know).
  glance_polls_open_one: "1 question up for a vote",
  glance_polls_open_other_template: "{count} questions up for a vote",
} as const;

export type DashboardGlanceStringKey = keyof typeof DASHBOARD_GLANCE_STRINGS;

/**
 * A11y-only strings — never rendered as visible copy, so they're exempt
 * from the voice-test but still centralized per "don't inline copy
 * literals" (issue #466: route-level loading.tsx skeletons need a
 * screen-reader-only status label).
 */
export const A11Y_UI_STRINGS = {
  loading: "Loading",
  // Task 6 — accessible group name for the shopping-list segmented filter
  // (All / Open / In-progress / Completed / Removed). Not visibly
  // rendered — the group's own heading already says "Shopping list".
  shoppingListFilterGroup: "Filter",
} as const;
