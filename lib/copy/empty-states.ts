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
  | "invites_for_trip";

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
  // /trips/[tripId] — link to the dates page (Wave 3 #75 #76)
  dashboard_dates_link_label: "Pick the dates",
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
  datePoll_no_candidates_yet:
    "No windows proposed yet. Drop one and we'll start voting.",
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
  // Validation messages (zod schema errors — user-visible)
  itineraryForm_validation_title_required: "Title is required",
  itineraryForm_validation_day_format: "Must be YYYY-MM-DD",
  // Lodging assignments (#36, Wave 2)
  lodging_assignments_heading: "Who's in which room",
  lodging_room_label_placeholder: "Master, bunk room, the loft, …",
  lodging_assign_cta: "Assign a room",
  lodging_unassign_cta: "Unassign",
  lodging_assign_pick_person: "— Pick a person —",
  // Now/next card (#77, Wave 3b)
  nowNext_pretrip_template: "Trip starts in {days}.",
  nowNext_today_label: "Today",
  nowNext_now_heading: "Right now",
  nowNext_next_heading: "Up next",
  nowNext_posttrip_template: "Trip wrapped {days} ago.",
  nowNext_recap_placeholder: "Recap (coming soon)",
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
  // Announcement card badges (#79, Wave 3a fix-up — pulled from inline literals
  // per Override F after code-review HIGH finding)
  announcements_badge_pinned: "Pinned",
  announcements_badge_organizers_only: "Organizers only",
  announcements_badge_hide_celebrant: "Hidden from the celebrant",
  announcements_badge_custom: "Custom audience",
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
  arrivals_leg_form_notes_label: "Notes",
  arrivals_leg_form_submit: "Save it",
  arrivals_leg_form_delete: "Delete travel",
  arrivals_empty: "Nobody's logged travel yet. Drop yours so we know when you land.",
  // Arrivals CTAs (Wave 4a fix-up — added so we don't reuse itineraryForm_* keys
  // cross-feature; voice-tested)
  arrivals_cancel_cta: "Cancel",
  arrivals_edit_cta: "Edit",
  arrivals_add_cta: "Add your travel",
  // #382: caption under the travel-leg time fields. {city} comes from
  // trips.timezone via timezoneCityLabel — the form parses input as
  // trip-local wall clock, so tell the user which clock they're typing on.
  arrivals_leg_form_tz_caption_template:
    "Times are {city} time — no matter where you're flying from.",
  // Roster + contacts (#39, #40, Wave 4b)
  roster_pageTitle: "Roster",
  roster_heading: "Who's coming",
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
  // Itinerary item — dress-code chip picker
  itineraryItem_dressCode_placeholder: "Pick a vibe or type your own",
  // Itinerary item — activity-tag chip picker
  itineraryItem_activityTag_placeholder: "Add a tag",
  // Travel leg — airline typeahead
  // Voice lock: matches arrivals_leg_form_carrier_label palette tone.
  travelLeg_airline_placeholder: "Type your airline",
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
  expensesForm_visibility_label: "Who sees this?",
  expensesForm_submit: "Log it",
  expensesForm_cancel: "Never mind",
  // #383 — correctable money. Edit/delete on the expense card. Same
  // voice test; delete confirm is two-step (tap again), so it asks the
  // question out loud instead of raising a modal.
  expenses_edit_cta: "Edit",
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
  polls_closed_winner_template: "{label} takes it",
  polls_closed_tie: "Dead heat. Sort it out over a drink.",
  polls_closed_no_votes: "Nobody weighed in. Organizer's call.",
  polls_option_vote_aria_template: "Vote {label}",
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
  // Roster — organizer-only per-day headcount line
  memberDays_headcount_heading: "Who's around when",
  // Screen-reader expansion of the mono "thu 8 · fri 12" line — the
  // compact register is ambiguous read aloud ("thu 8" could be a date).
  memberDays_headcount_day_aria_template: "{count} in on {day}",
} as const;

export type MemberDaysUIStringKey = keyof typeof MEMBER_DAYS_UI_STRINGS;
