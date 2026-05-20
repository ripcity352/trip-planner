/**
 * TripNotesView — read-only render of trips.notes (#78).
 *
 * Server Component. Renders the notes text with the heading from the
 * copy palette. Two empty-state variants based on the `isOrganizer` prop:
 *   - organizer sees a prompt-to-fill copy (so they know what goes here)
 *   - member sees a minimal "nothing posted yet" string
 *
 * Mutations go through TripNotesEditor (client component), which wraps
 * this view when the organizer is present.
 */

import { M3_UI_STRINGS } from "@/lib/copy/empty-states";

interface TripNotesViewProps {
  notes: string | null;
  isOrganizer: boolean;
}

export function TripNotesView({ notes, isOrganizer }: TripNotesViewProps) {
  // Treat null and empty string identically — both mean "no notes yet".
  const hasNotes = notes !== null && notes !== "";

  return (
    <div>
      <h2 className="text-base font-semibold">{M3_UI_STRINGS.tripNotes_heading}</h2>
      {hasNotes ? (
        <p className="text-sm mt-2 whitespace-pre-wrap">{notes}</p>
      ) : (
        <p className="text-muted-foreground text-sm mt-2">
          {isOrganizer
            ? M3_UI_STRINGS.tripNotes_empty_organizer
            : M3_UI_STRINGS.tripNotes_empty_member}
        </p>
      )}
    </div>
  );
}
