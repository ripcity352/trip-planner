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
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
