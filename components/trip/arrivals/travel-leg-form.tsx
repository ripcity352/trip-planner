"use client";

/**
 * TravelLegForm — add or edit a travel leg.
 *
 * Add mode: `leg` prop omitted. Submits an insert via `upsertTravelLeg`.
 * Edit mode: `leg` prop present. Pre-populates fields; includes a delete
 * button that calls `deleteTravelLeg`.
 *
 * Uses react-hook-form + zod. Server action does its own validation
 * (defense-in-depth). No new dependencies.
 *
 * Idempotency: `crypto.randomUUID()` on every submit per the strictly-user
 * table ADR (scope: trip_id + trip_member_id + idempotency_key).
 *
 * M4 W2c: integrates AirlinePicker for airline_iata + flight_number.
 */

import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { fromDatetimeLocal, toDatetimeLocal } from "@/lib/utils/datetime";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import { upsertTravelLeg, deleteTravelLeg } from "@/lib/actions/travel-legs";
import type { TravelLeg } from "@/lib/db/types";
import { AirlinePicker } from "./airline-picker";

const LEG_KINDS = ["flight", "train", "drive", "other"] as const;

const formSchema = z.object({
  kind: z.enum(LEG_KINDS),
  departAt: z.string().optional(),
  arriveAt: z.string().optional(),
  carrier: z.string().trim().max(100).optional(),
  confirmationCode: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(1000).optional(),
  // M4 W2c additions — airline picker
  airlineIata: z
    .string()
    .regex(/^[A-Z0-9]{2}$/)
    .optional(),
  flightNumber: z
    .string()
    .regex(/^[A-Z0-9]{1,8}$/)
    .optional(),
});

type FormValues = z.infer<typeof formSchema>;

const KIND_LABELS: Record<(typeof LEG_KINDS)[number], string> = {
  flight: M3_UI_STRINGS.arrivals_leg_form_kind_flight,
  train: M3_UI_STRINGS.arrivals_leg_form_kind_train,
  drive: M3_UI_STRINGS.arrivals_leg_form_kind_drive,
  other: M3_UI_STRINGS.arrivals_leg_form_kind_other,
};

export interface TravelLegFormProps {
  tripId: string;
  /** Present in edit mode; omit for add mode. */
  leg?: TravelLeg;
  onSuccess: () => void;
  onCancel: () => void;
}

export function TravelLegForm({
  tripId,
  leg,
  onSuccess,
  onCancel,
}: TravelLegFormProps) {
  const isEditMode = !!leg;
  const [serverErrorKey, setServerErrorKey] = React.useState<ErrorKey | null>(
    null
  );
  const [isDeleting, setIsDeleting] = React.useState(false);

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      kind: leg?.kind ?? "flight",
      departAt: toDatetimeLocal(leg?.depart_at),
      arriveAt: toDatetimeLocal(leg?.arrive_at),
      carrier: leg?.carrier ?? "",
      confirmationCode: leg?.confirmation_code ?? "",
      notes: leg?.notes ?? "",
      // M4 W2c: pre-populate from leg if editing
      airlineIata: leg?.airline_iata ?? undefined,
      flightNumber: leg?.flight_number ?? undefined,
    },
  });

  const onSubmit = async (values: FormValues) => {
    setServerErrorKey(null);
    const idempotencyKey = crypto.randomUUID();

    // #248: cross-field guard. airlineIata + flightNumber are flight-only.
    // If the user starts on flight, fills the airline picker, then switches
    // kind to drive/train/other, RHF still holds the stale values — clear
    // them here so the server superRefine guard is never reached in normal
    // use. Belt + suspenders with the server-side check.
    //
    // If the server's validation_failed surfaces here in production it
    // signals a client bug (e.g. RHF mutated externally, or a future caller
    // forgets the ternary), not a user error.
    const isFlight = values.kind === "flight";

    const result = await upsertTravelLeg(
      {
        tripId,
        kind: values.kind,
        departAt: fromDatetimeLocal(values.departAt),
        arriveAt: fromDatetimeLocal(values.arriveAt),
        carrier: values.carrier || null,
        confirmationCode: values.confirmationCode || null,
        notes: values.notes || null,
        legId: isEditMode ? leg.id : undefined,
        // M4 W2c additions — only sent when kind === "flight" (#248)
        airlineIata: isFlight ? values.airlineIata || null : null,
        flightNumber: isFlight ? values.flightNumber || null : null,
      },
      idempotencyKey
    );

    if (!result.ok) {
      setServerErrorKey(result.errorKey);
      return;
    }

    onSuccess();
  };

  const handleDelete = async () => {
    if (!leg) return;
    setServerErrorKey(null);
    setIsDeleting(true);

    const result = await deleteTravelLeg(leg.id);

    setIsDeleting(false);

    if (!result.ok) {
      setServerErrorKey(result.errorKey);
      return;
    }

    onSuccess();
  };

  const kind = watch("kind");

  const inputClass = cn(
    "w-full rounded-xs border border-border bg-background px-3 py-2 text-sm",
    "placeholder:text-muted-foreground",
    "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
    "disabled:cursor-not-allowed disabled:opacity-60"
  );

  const labelClass = "block text-sm font-medium text-foreground mb-1";
  const isBusy = isSubmitting || isDeleting;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      {/* Kind */}
      <div>
        <label htmlFor="leg-kind" className={labelClass}>
          {M3_UI_STRINGS.arrivals_leg_form_kind_label}
        </label>
        <select
          id="leg-kind"
          {...register("kind")}
          disabled={isBusy}
          className={inputClass}
        >
          {LEG_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </div>

      {/* Depart */}
      <div>
        <label htmlFor="leg-depart" className={labelClass}>
          {M3_UI_STRINGS.arrivals_leg_form_depart_label}
        </label>
        <input
          id="leg-depart"
          type="datetime-local"
          {...register("departAt")}
          disabled={isBusy}
          className={inputClass}
        />
      </div>

      {/* Arrive */}
      <div>
        <label htmlFor="leg-arrive" className={labelClass}>
          {M3_UI_STRINGS.arrivals_leg_form_arrive_label}
        </label>
        <input
          id="leg-arrive"
          type="datetime-local"
          {...register("arriveAt")}
          disabled={isBusy}
          className={inputClass}
        />
      </div>

      {/* Carrier — AirlinePicker for flights; plain text for all other kinds */}
      {kind === "flight" ? (
        <Controller
          name="airlineIata"
          control={control}
          render={({ field: airlineField }) => (
            <Controller
              name="flightNumber"
              control={control}
              render={({ field: flightField }) => (
                <Controller
                  name="carrier"
                  control={control}
                  render={({ field: carrierField }) => (
                    <AirlinePicker
                      value={{
                        airlineIata: airlineField.value,
                        flightNumber: flightField.value,
                        carrier: carrierField.value,
                      }}
                      onChange={(next) => {
                        airlineField.onChange(next.airlineIata);
                        flightField.onChange(next.flightNumber);
                        // Freeform carrier flows back into the carrier field
                        if (next.carrier !== undefined) {
                          carrierField.onChange(next.carrier);
                        }
                      }}
                      disabled={isBusy}
                    />
                  )}
                />
              )}
            />
          )}
        />
      ) : (
        <div>
          <label htmlFor="leg-carrier" className={labelClass}>
            {M3_UI_STRINGS.arrivals_leg_form_carrier_label}
          </label>
          <input
            id="leg-carrier"
            type="text"
            {...register("carrier")}
            disabled={isBusy}
            className={inputClass}
          />
        </div>
      )}

      {/* Confirmation code */}
      <div>
        <label htmlFor="leg-confirmation" className={labelClass}>
          {M3_UI_STRINGS.arrivals_leg_form_confirmation_label}
        </label>
        <input
          id="leg-confirmation"
          type="text"
          {...register("confirmationCode")}
          disabled={isBusy}
          className={inputClass}
        />
      </div>

      {/* Notes */}
      <div>
        <label htmlFor="leg-notes" className={labelClass}>
          {M3_UI_STRINGS.arrivals_leg_form_notes_label}
        </label>
        <textarea
          id="leg-notes"
          rows={2}
          {...register("notes")}
          disabled={isBusy}
          className={cn(inputClass, "resize-none")}
        />
      </div>

      {/* Server error */}
      {serverErrorKey ? (
        <p role="alert" className={cn(ERROR_LINE_CLASS, "text-sm")}>
          {ERRORS[serverErrorKey]}
        </p>
      ) : null}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={isBusy}
          className={cn(
            "focus-visible:ring-ring h-11 rounded-xs bg-primary px-5 text-sm font-medium text-primary-foreground",
            "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-60"
          )}
        >
          {M3_UI_STRINGS.arrivals_leg_form_submit}
        </button>

        <button
          type="button"
          onClick={onCancel}
          disabled={isBusy}
          className={cn(
            "focus-visible:ring-ring h-11 rounded-xs border border-border bg-muted px-5 text-sm font-medium text-muted-foreground",
            "hover:bg-muted/80 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-60"
          )}
        >
          {M3_UI_STRINGS.arrivals_cancel_cta}
        </button>

        {/* Delete — edit mode only */}
        {isEditMode ? (
          <button
            type="button"
            onClick={handleDelete}
            disabled={isBusy}
            className={cn(
              "focus-visible:ring-ring ml-auto h-11 rounded-xs border border-destructive/50 px-5 text-sm font-medium text-destructive",
              "hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
              "disabled:cursor-not-allowed disabled:opacity-60"
            )}
          >
            {M3_UI_STRINGS.arrivals_leg_form_delete}
          </button>
        ) : null}
      </div>
    </form>
  );
}
