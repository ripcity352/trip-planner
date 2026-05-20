/**
 * Trip notes data layer — read-only query functions for `trips.notes`.
 *
 * Mutations go through `lib/actions/trip-notes.ts` (Server Action).
 * We expose a focused read surface here so Server Components don't
 * need to pull the entire Trip row just for the notes field.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Return the notes text for a trip. Returns null if the trip has no
 * notes set, or if the caller is not a trip member (RLS returns null).
 *
 * Callers should treat null and the empty string identically in the UI —
 * both mean "no notes yet."
 */
export async function getTripNotes(
  supabase: SupabaseClient,
  tripId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("trips")
    .select("notes")
    .eq("id", tripId)
    .maybeSingle();

  if (error) {
    throw new Error(`getTripNotes failed: ${error.message}`);
  }

  return (data as { notes: string | null } | null)?.notes ?? null;
}
