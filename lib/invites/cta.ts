/**
 * #367 — invite-landing CTA branch, extracted as a pure resolver so the
 * truth table is unit-testable without rendering the Server Component
 * (house pattern: `deriveStateFromHasPassword`).
 *
 * The invite link lives in the group chat and members re-tap it
 * constantly to get back to the app — for them the link is a RE-ENTRY
 * point, not an invitation, so the accept form would lie ("I'm not in
 * yet"). Re-tapping accept stays harmless (idempotent re-claim), but the
 * affordance should tell the truth.
 */

export type InviteCta = "sign-in" | "accept" | "open-trip";

export function resolveInviteCta(args: {
  isSignedIn: boolean;
  viewerIsMember: boolean;
}): InviteCta {
  // Membership is only trustworthy on a cookie-bound RPC call; the anon
  // path must render byte-identically no matter what the flag says.
  if (!args.isSignedIn) return "sign-in";
  return args.viewerIsMember ? "open-trip" : "accept";
}
