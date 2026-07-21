"use client";

/**
 * EditTripSheet — organizer-only name/location edit for the dashboard
 * header, plus (#476) a dates correction when the trip already has
 * dates. The page decides who gets it (rule 11: non-organizers never
 * see the trigger — no disabled states, no locked register); this
 * component renders a small "Edit" affordance that swaps to a form,
 * following the EditExpenseSheet pattern (show/hide, no animation lib,
 * react-hook-form + zod, callAction envelope guard #431).
 *
 * Dates are gated by `hasDates`: an UNDATED trip never sees date fields
 * here — the /dates poll flow is the only way to set a first date. Once
 * a trip has dates, this sheet becomes the correction path for a typo
 * (#476 — the exclusion documented here previously was a deliberate
 * scope cut, reversed by operator decision 2026-07-21).
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
// rejected field must SAY why, not just shift a border colour). Dates
// are optional here too — they're only rendered/submitted when
// `hasDates` is true, but the schema stays permissive so the same form
// values shape works whether or not the fields are on screen.
const tripEditFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, FIELD_ERRORS.trip_name_required)
      .max(100, FIELD_ERRORS.trip_name_too_long),
    location: z.string().trim().max(200, FIELD_ERRORS.trip_location_too_long),
    starts_at: z.string().trim().min(1).optional(),
    ends_at: z.string().trim().min(1).optional(),
  })
  .refine(
    (data) =>
      !data.starts_at || !data.ends_at || data.ends_at >= data.starts_at,
    {
      message: ERRORS.trip_dates_reversed,
      path: ["ends_at"],
    }
  );

type TripEditFormValues = z.infer<typeof tripEditFormSchema>;

export interface EditTripSheetProps {
  tripId: string;
  initialName: string;
  initialLocation: string | null;
  /**
   * #476: only pass real dates when the trip already has both — an
   * undated trip must not get date fields here (the /dates poll flow
   * owns setting dates for the first time). Passing null for either
   * hides the whole dates section.
   */
  initialStartsAt: string | null;
  initialEndsAt: string | null;
  /** Applied to the closed "Edit" trigger only (layout hint from the page). */
  triggerClassName?: string;
}

export function EditTripSheet({
  tripId,
  initialName,
  initialLocation,
  initialStartsAt,
  initialEndsAt,
  triggerClassName,
}: EditTripSheetProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [serverErrorKey, setServerErrorKey] = React.useState<ErrorKey | null>(
    null
  );

  // #476 scope guard (a): dates only ever render for a trip that ALREADY
  // has both dates set. An undated trip keeps the /dates poll flow
  // exclusively — this component never offers a way to seed a first date.
  const hasDates = initialStartsAt !== null && initialEndsAt !== null;

  const defaultValues = React.useMemo<TripEditFormValues>(
    () => ({
      name: initialName,
      location: initialLocation ?? "",
      starts_at: hasDates ? (initialStartsAt ?? undefined) : undefined,
      ends_at: hasDates ? (initialEndsAt ?? undefined) : undefined,
    }),
    [initialName, initialLocation, initialStartsAt, initialEndsAt, hasDates]
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TripEditFormValues>({
    resolver: zodResolver(tripEditFormSchema),
    defaultValues,
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
          // Only ever sent when the section is on screen — an undated
          // trip's form never registers these fields, so they stay
          // undefined and the action leaves dates untouched.
          starts_at: hasDates ? values.starts_at : undefined,
          ends_at: hasDates ? values.ends_at : undefined,
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
        onClick={() => {
          // Re-seed from the latest server-rendered props on every open:
          // RHF captures defaultValues once at mount, but this component
          // stays mounted across RSC re-renders, so a concurrent
          // organizer's rename would otherwise be silently reverted by a
          // save from this stale snapshot.
          reset(defaultValues);
          setOpen(true);
        }}
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

      {hasDates ? (
        <div className="flex flex-col gap-1.5">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="edit-trip-starts-at" className={labelClass}>
                {TRIP_EDIT_UI_STRINGS.tripEdit_startLabel}
              </label>
              <input
                id="edit-trip-starts-at"
                type="date"
                className={inputClass}
                disabled={isSubmitting}
                {...register("starts_at")}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="edit-trip-ends-at" className={labelClass}>
                {TRIP_EDIT_UI_STRINGS.tripEdit_endLabel}
              </label>
              <input
                id="edit-trip-ends-at"
                type="date"
                className={inputClass}
                disabled={isSubmitting}
                {...register("ends_at")}
              />
            </div>
          </div>
          {errors.ends_at?.message ? (
            <p role="alert" className={cn(ERROR_LINE_CLASS, "text-xs")}>
              {errors.ends_at.message}
            </p>
          ) : null}
          <p className="text-muted-foreground text-xs">
            {TRIP_EDIT_UI_STRINGS.tripEdit_dates_caution}
          </p>
        </div>
      ) : null}

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
            reset(defaultValues);
            setOpen(false);
          }}
        >
          {TRIP_EDIT_UI_STRINGS.tripEdit_cancel}
        </Button>
      </div>
    </form>
  );
}
