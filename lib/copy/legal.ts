/**
 * Legal copy palette — terms of service and privacy stubs.
 *
 * Voice rule: "would you say this at a pre-trip dinner?"
 * Warm, plainspoken, brief. Never corporate, never legalese.
 * Anti-patterns: "BY USING THIS SERVICE YOU AGREE", "hereinafter",
 * "acknowledge and agree", "the Service", "pursuant to".
 *
 * When adding a key:
 *   1. Add it to `LEGAL_COPY`.
 *   2. Read it aloud once. If it sounds like a terms-of-service generator,
 *      rewrite it.
 *   3. No HTML in values — plain text only.
 *
 * Voice-locked per Override F + H — strings pinned in
 * lib/copy/__tests__/legal.test.ts. Change here = change everywhere.
 */

export const LEGAL_COPY = {
  // ---------------------------------------------------------------------------
  // /legal/terms — terms of service stub
  // ---------------------------------------------------------------------------
  terms_heading: "The terms",
  terms_intro:
    "Quick version: this is a planning tool for one party. Don't use it to harass anyone. Be kind.",

  terms_what_section_heading: "What this is",
  terms_what_body:
    "You sign in with your email and create or join a trip. That's it.",

  terms_data_section_heading: "Your data",
  terms_data_body:
    "What you type goes to our database. We don't sell it. We don't share it. We don't run ads.",

  terms_contact_section_heading: "Questions",
  terms_contact_body: "Email support@travelston.com and we'll sort it out.",

  // ---------------------------------------------------------------------------
  // /legal/privacy — privacy policy stub
  // ---------------------------------------------------------------------------
  privacy_heading: "What we keep",
  privacy_intro: "Just enough to run the app. No more.",

  privacy_what_section_heading: "What we store",
  privacy_what_body:
    "Your email. Your RSVPs. The trip you're on. The chips you picked.",

  privacy_share_section_heading: "Who we share it with",
  privacy_share_body:
    "We don't share your data with anyone. Not now, not later.",

  privacy_delete_section_heading: "Deleting your data",
  privacy_delete_body:
    "Email support@travelston.com to delete your data. We'll handle it within a week.",
} as const;

export type LegalCopyKey = keyof typeof LEGAL_COPY;
