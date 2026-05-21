/**
 * /account/sign-in-and-security — server component (M5/PR4).
 *
 * Reads auth.getUser() + inspects user.identities to determine identity state
 * (A, A+, or no-password), then hands off to the client form.
 *
 * Identity states:
 *   A          — password identity only
 *   A+         — password + at least one OAuth identity
 *   no-password — OAuth only (PR5 builds full State B; PR4 renders a stub)
 *
 * Auth guard: the (authed) layout redirects unauthenticated users to /login
 * before this component renders. The explicit null-check below is an
 * additional defensive guard.
 */

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { deriveIdentityState } from "./_form-state";
import { SecurityForm } from "./_form";

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

  const identityState = deriveIdentityState(user);
  const userEmail = user.email ?? "";

  return (
    <SecurityForm identityState={identityState} userEmail={userEmail} />
  );
}
