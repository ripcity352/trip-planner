"use client";

/**
 * TripNotesEditor — inline edit for trips.notes (#78).
 *
 * Organizer-only: non-organizers see the heading + notes text only (or
 * the member empty-state copy), with no edit affordance.
 *
 * Edit flow:
 *   1. Click "Edit" → textarea with current notes pre-filled.
 *   2. "Save" → calls setTripNotes({ tripId, notes }); returns to view
 *      mode on success.
 *   3. "Cancel" → returns to view mode without saving.
 *   4. On failure → inline error message below the form; stays in edit
 *      mode so the organizer can retry.
 *
 * react-hook-form + zod for form management (consistent with the rest
 * of the codebase per CLAUDE.md).
 */

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { setTripNotes } from "@/lib/actions/trip-notes";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS } from "@/lib/copy/errors";

const schema = z.object({
  notes: z.string().max(10_000).nullable(),
});

type FormValues = z.infer<typeof schema>;

interface TripNotesEditorProps {
  tripId: string;
  initialNotes: string | null;
  isOrganizer: boolean;
}

export function TripNotesEditor({
  tripId,
  initialNotes,
  isOrganizer,
}: TripNotesEditorProps) {
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState<string | null>(initialNotes);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { register, handleSubmit, formState: { isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { notes: initialNotes ?? "" },
  });

  const hasNotes = notes !== null && notes !== "";

  async function onSubmit(values: FormValues) {
    setErrorMessage(null);
    const result = await setTripNotes({ tripId, notes: values.notes });
    if (result.ok) {
      setNotes(values.notes);
      setEditing(false);
    } else {
      setErrorMessage(ERRORS[result.errorKey] ?? ERRORS.trip_notes_save_failed);
    }
  }

  function handleCancel() {
    setErrorMessage(null);
    setEditing(false);
  }

  return (
    <div>
      <h2 className="text-base font-semibold">{M3_UI_STRINGS.tripNotes_heading}</h2>

      {editing ? (
        <form onSubmit={handleSubmit(onSubmit)} className="mt-2 space-y-2">
          <textarea
            {...register("notes")}
            className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
            placeholder={M3_UI_STRINGS.tripNotes_placeholder}
          />
          {errorMessage ? (
            <p className="text-destructive text-sm" role="alert">
              {errorMessage}
            </p>
          ) : null}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              {M3_UI_STRINGS.tripNotes_save_cta}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={isSubmitting}
              className="h-11 rounded-md border border-input px-4 text-sm font-medium"
            >
              {M3_UI_STRINGS.tripNotes_cancel_cta}
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-2">
          {hasNotes ? (
            <p className="text-sm whitespace-pre-wrap">{notes}</p>
          ) : (
            <p className="text-muted-foreground text-sm">
              {isOrganizer
                ? M3_UI_STRINGS.tripNotes_empty_organizer
                : M3_UI_STRINGS.tripNotes_empty_member}
            </p>
          )}
          {isOrganizer ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="mt-2 h-11 rounded-md border border-input px-4 text-sm font-medium"
            >
              {M3_UI_STRINGS.tripNotes_edit_cta}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
