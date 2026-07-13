"use client";

/**
 * EditTripSheet — organizer-only name/location edit for the dashboard
 * header. The page decides who gets it (rule 11: non-organizers never
 * see the trigger — no disabled states, no locked register); this
 * component renders a small "Edit" affordance that swaps to a two-field
 * form, following the EditExpenseSheet pattern (show/hide, no animation
 * lib, react-hook-form + zod, callAction envelope guard #431).
 *
 * Exactly TWO fields, deliberately. Dates are owned by the /dates poll
 * flow and are not editable here; there is no settings screen behind
 * this — it's a header correction, not preferences.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { cn } from "@/lib/utils";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { callAction } from "@/lib/ui/call-action";
import { Button } from "@/components/ui/button";
import { updateTripAction } from "@/lib/actions/trips";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import { FIELD_ERRORS } from "@/lib/copy/field-errors";
import { TRIP_EDIT_UI_STRINGS } from "@/lib/copy/empty-states";

// Client-side mirror of the server schema's bounds (#401 register: a
// rejected field must SAY why, not just shift a border colour).
const tripEditFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, FIELD_ERRORS.trip_name_required)
    .max(100, FIELD_ERRORS.trip_name_too_long),
  location: z.string().trim().max(200, FIELD_ERRORS.trip_location_too_long),
});

type TripEditFormValues = z.infer<typeof tripEditFormSchema>;

export interface EditTripSheetProps {
  tripId: string;
  initialName: string;
  initialLocation: string | null;
  /** Applied to the closed "Edit" trigger only (layout hint from the page). */
  triggerClassName?: string;
}

export function EditTripSheet({
  tripId,
  initialName,
  initialLocation,
  triggerClassName,
}: EditTripSheetProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [serverErrorKey, setServerErrorKey] = React.useState<ErrorKey | null>(
    null
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TripEditFormValues>({
    resolver: zodResolver(tripEditFormSchema),
    defaultValues: {
      name: initialName,
      location: initialLocation ?? "",
    },
  });

  const onSubmit = async (values: TripEditFormValues) => {
    setServerErrorKey(null);

    // #431: rejected awaits resolve to the network envelope via callAction.
    const result = await callAction(() =>
      updateTripAction(
        {
          tripId,
          name: values.name,
          location: values.location.length > 0 ? values.location : null,
        },
        crypto.randomUUID()
      )
    );

    if (!result.ok) {
      setServerErrorKey(result.errorKey);
      return;
    }

    setOpen(false);
    router.refresh();
  };

  if (!open) {
    return (
      <button
        type="button"
        aria-label={TRIP_EDIT_UI_STRINGS.tripEdit_cta_aria}
        onClick={() => setOpen(true)}
        className={cn(
          "focus-visible:ring-ring rounded-xs border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground",
          "hover:bg-muted/80 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
          triggerClassName
        )}
      >
        {TRIP_EDIT_UI_STRINGS.tripEdit_cta}
      </button>
    );
  }

  const inputClass = cn(
    "w-full rounded-xs border border-border bg-background px-3 py-2 text-sm",
    "placeholder:text-muted-foreground",
    "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
    "disabled:cursor-not-allowed disabled:opacity-60"
  );
  const labelClass = "text-sm font-medium";

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="w-full flex flex-col gap-4 rounded-sm border border-border bg-card p-4"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="edit-trip-name" className={labelClass}>
          {TRIP_EDIT_UI_STRINGS.tripEdit_name_label}
        </label>
        <input
          id="edit-trip-name"
          type="text"
          className={inputClass}
          disabled={isSubmitting}
          {...register("name")}
        />
        {errors.name?.message ? (
          <p role="alert" className={cn(ERROR_LINE_CLASS, "text-xs")}>
            {errors.name.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="edit-trip-location" className={labelClass}>
          {TRIP_EDIT_UI_STRINGS.tripEdit_location_label}
        </label>
        <input
          id="edit-trip-location"
          type="text"
          placeholder={TRIP_EDIT_UI_STRINGS.tripEdit_location_placeholder}
          className={inputClass}
          disabled={isSubmitting}
          {...register("location")}
        />
        {errors.location?.message ? (
          <p role="alert" className={cn(ERROR_LINE_CLASS, "text-xs")}>
            {errors.location.message}
          </p>
        ) : null}
      </div>

      {serverErrorKey ? (
        <p role="alert" className={cn(ERROR_LINE_CLASS, "text-sm")}>
          {ERRORS[serverErrorKey] ?? ERRORS.network}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
          {TRIP_EDIT_UI_STRINGS.tripEdit_submit}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={isSubmitting}
          onClick={() => {
            setServerErrorKey(null);
            reset({ name: initialName, location: initialLocation ?? "" });
            setOpen(false);
          }}
        >
          {TRIP_EDIT_UI_STRINGS.tripEdit_cancel}
        </Button>
      </div>
    </form>
  );
}
