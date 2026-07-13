/**
 * Field-error copy palette (#401).
 *
 * The register for client-side field-validation copy: the message a
 * composer shows when zod rejects a single field before the server ever
 * sees it. Distinct from `lib/copy/errors.ts` (ERRORS), which names
 * *server-action* failures. A rejected field must SAY why — a border
 * colour shift alone is easy to miss at 375px and leaves the user with a
 * dead "Send it" and no explanation (see notes/design-system.md
 * "Form-field error copy axis").
 *
 * Voice test: "would you say this out loud at a pre-trip dinner?"
 * Warm, specific, blame-free — never "Body is required" / "Invalid input".
 *
 * These strings are attached to the zod schemas as the field's `message`
 * so `formState.errors.<field>.message` renders them verbatim through the
 * shared error line.
 */

export const FIELD_ERRORS = {
  // Announcements composer
  announcement_body_required: "Say something first — even a line works.",
  announcement_body_too_long: "That's a lot. Trim it to fit.",

  // Add/Edit expense sheet
  expense_description_required: "Give it a name — what was the spend?",
  expense_amount_required: "How much? Pop in an amount over $0.",
  expense_amount_invalid: "How much? Pop in an amount over $0.",

  // Dashboard-header trip edit sheet
  trip_name_required: "The trip needs a name — even a working title.",
  trip_name_too_long: "That's a mouthful. Trim the name down a bit.",
  trip_location_too_long: "That's a lot of address. Keep it short.",
} as const;

export type FieldErrorKey = keyof typeof FIELD_ERRORS;
