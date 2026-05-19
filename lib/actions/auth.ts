"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * Sign out the current user and bounce them to `/login`.
 *
 * Order matters: the Supabase client must clear the session cookies
 * *before* the redirect, otherwise the browser still ships a valid
 * session to the next request and the user lands back on the
 * authenticated layout in a loop. Wire this from the header's account
 * menu (see `components/trip/header-menu.tsx`).
 */
export async function signOut(): Promise<never> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    // Better to send the user away than strand them mid-redirect. Log
    // so we see this in Sentry if it happens; the cookie clear failure
    // mode is rare but real (refresh-token revocation race).
    console.error("[auth] signOut failed:", error.message);
  }
  redirect("/login");
}
