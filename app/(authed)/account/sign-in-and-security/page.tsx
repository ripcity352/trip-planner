/**
 * /account/sign-in-and-security — server component (M5/PR4, W2c).
 *
 * Reads auth.getUser() + profiles.has_password to determine identity state
 * (A, A+, or no-password), then hands off to the client form.
 *
 * Identity states:
 *   A          — has a password (no OAuth)
 *   A+         — has a password + at least one OAuth identity
 *   no-password — no password set (OTP-only or OAuth-only)
 *
 * W2c fix (#233): the previous implementation checked
 * `identities.some(id => id.provider === "email")` which returns true for
 * OTP-signup users (Supabase assigns provider="email" to them). This caused
 * OTP-only users to see State A (which prompts for a current password they
 * don't have). The fix reads `profiles.has_password` — a shadow column
 * written atomically by every password-setting server action (W0).
 *
 * Auth guard: the (authed) layout redirects unauthenticated users to /login
 * before this component renders. The explicit null-check below is an
 * additional defensive guard.
 */

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/db/profiles";
import { SecurityForm } from "./_form";
import { deriveStateFromHasPassword } from "./_form-state";
import type { IdentityState } from "./_form-state";

export const metadata = {
  title: "Sign-in & security",
};

export default async function SignInAndSecurityPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Layout guard ensures user is present, but be defensive.
  if (!user) {
    redirect("/login");
  }

  // Read has_password from the profiles shadow column — the source of truth
  // for whether this user has a password identity. Defaults to false if the
  // profile row is missing (should not happen in production, but be defensive).
  const profile = await getProfile(supabase, user.id);
  const hasPassword = profile?.has_password ?? false;

  // Detect OAuth identity for A+ state and State B subtype copy.
  const identities = user.identities ?? [];
  const hasOAuth = identities.some((id) => id.provider !== "email");

  // Derive identity state from has_password (not from identities array).
  const identityState: IdentityState = deriveStateFromHasPassword(hasPassword, hasOAuth);

  const userEmail = user.email ?? "";

  // For State B helper copy: distinguish OAuth-only from OTP-only.
  // OAuth-only: has a non-email provider identity. OTP-only: no identities.
  const identitySubtype: "oauth" | "otp" | undefined =
    identityState === "no-password"
      ? hasOAuth
        ? "oauth"
        : "otp"
      : undefined;

  return (
    <SecurityForm
      identityState={identityState}
      userEmail={userEmail}
      identitySubtype={identitySubtype}
    />
  );
}
