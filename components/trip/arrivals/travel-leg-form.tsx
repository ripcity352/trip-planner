"use client";

/**
 * TravelLegForm — add or edit a travel leg (#477 two-section model).
 *
 * A leg is inbound ("Getting there" — you land AT the trip city) or
 * outbound ("Heading home" — you take off FROM the trip city). Each
 * direction records ONLY the trip-city-side instant: inbound collects the
 * arrival, outbound collects the departure. That matches the airline
 * convention (origin-local depart / destination-local arrive), so the
 * old #382 "Times are {city} time" caption is gone — the one time you
 * type IS a trip-city time.
 *
 * Add mode: `leg` prop omitted; `direction` comes from the CTA the user
 * tapped in TravelLegFormSheet. Edit mode: `leg` prop present; the
 * section is derived from `leg.direction`.
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
// #382/#477: trip-TZ input pair — datetime-local values are wall-clock
// time in the TRIP's timezone, matching the trip-TZ render on
// TravelLegCard. Under the two-section model that is also the airline
// convention's clock for the one instant each direction records.
import {
  toLocalInputValue,
  fromLocalInputValue,
} from "@/lib/utils/format-trip-tz";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import { callAction } from "@/lib/ui/call-action";
import { upsertTravelLeg, deleteTravelLeg } from "@/lib/actions/travel-legs";
import type { TravelLeg, TravelLegDirection } from "@/lib/db/types";
import { AirlinePicker } from "./airline-picker";

const LEG_KINDS = ["flight", "train", "drive", "other"] as const;

const formSchema = z.object({
  kind: z.enum(LEG_KINDS),
  departAt: z.string().optional(),
  arriveAt: z.string().optional(),
  airport: z.string().trim().max(100).optional(),
  originLabel: z.string().trim().max(120).optional(),
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

// #477: direction-specific required time, mirrored on the server schema
// (the real gate — this copy is for inline UX). Inbound legs need the
// landing time; outbound legs need the takeoff time. Only one time field
// renders per direction, so the old #479 reversed-times client refine has
// nothing to compare (the server keeps its vestigial guard).
function makeFormSchema(direction: TravelLegDirection) {
  return formSchema.superRefine((values, ctx) => {
    if (direction === "inbound" && !(values.arriveAt ?? "")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["arriveAt"],
        message: M3_UI_STRINGS.arrivals_leg_form_arrive_required,
      });
    }
    if (direction === "outbound" && !(values.departAt ?? "")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["departAt"],
        message: M3_UI_STRINGS.arrivals_leg_form_depart_required,
      });
    }
  });
}

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
  /**
   * Which section the form is for (add mode). Ignored in edit mode —
   * the section is derived from `leg.direction`.
   */
  direction?: TravelLegDirection;
  /**
   * IANA timezone from `trips.timezone` (e.g. `"America/Los_Angeles"`).
   * The time input is parsed and rendered as wall clock in this
   * timezone — never the device's (#382).
   */
  tripTimezone: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export function TravelLegForm({
  tripId,
  leg,
  direction: directionProp,
  tripTimezone,
  onSuccess,
  onCancel,
}: TravelLegFormProps) {
  const isEditMode = !!leg;
  // #477: edit mode derives the section from the leg; add mode takes the
  // CTA's direction (defaulting inbound — "Getting there" is the primary).
  const direction: TravelLegDirection = leg
    ? leg.direction
    : (directionProp ?? "inbound");
  const isInbound = direction === "inbound";

  const [serverErrorKey, setServerErrorKey] = React.useState<ErrorKey | null>(
    null
  );
  const [isDeleting, setIsDeleting] = React.useState(false);

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { isSubmitting, errors },
  } = useForm<FormValues>({
    resolver: zodResolver(makeFormSchema(direction)),
    defaultValues: {
      kind: leg?.kind ?? "flight",
      departAt: toLocalInputValue(leg?.depart_at, tripTimezone),
      arriveAt: toLocalInputValue(leg?.arrive_at, tripTimezone),
      airport: leg?.airport ?? "",
      originLabel: leg?.origin_label ?? "",
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
    const isFlight = values.kind === "flight";

    // #431: rejected awaits resolve to the network envelope via callAction.
    const result = await callAction(() =>
      upsertTravelLeg(
        {
          tripId,
          kind: values.kind,
          direction,
          // #477: each direction records ONLY its trip-city-side instant.
          // The other column is written null — including on edits of
          // legacy rows that carried both times.
          departAt: isInbound
            ? null
            : fromLocalInputValue(values.departAt ?? "", tripTimezone),
          arriveAt: isInbound
            ? fromLocalInputValue(values.arriveAt ?? "", tripTimezone)
            : null,
          airport: values.airport || null,
          // #477: originLabel is inbound-only — mirror of the #248 pattern.
          originLabel: isInbound ? values.originLabel || null : null,
          carrier: values.carrier || null,
          confirmationCode: values.confirmationCode || null,
          notes: values.notes || null,
          legId: isEditMode ? leg.id : undefined,
          // M4 W2c additions — only sent when kind === "flight" (#248)
          airlineIata: isFlight ? values.airlineIata || null : null,
          flightNumber: isFlight ? values.flightNumber || null : null,
        },
        idempotencyKey
      )
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

    // #431: a rejected delete used to skip the reset below, leaving the
    // whole sheet disabled (isBusy) until reload.
    const result = await callAction(() => deleteTravelLeg(leg.id));

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

  const timeFieldName = isInbound ? "arriveAt" : "departAt";
  const timeError = isInbound ? errors.arriveAt : errors.departAt;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      {/* Trip-city-side time — the one required field per direction */}
      <div>
        <label htmlFor="leg-time" className={labelClass}>
          {isInbound
            ? M3_UI_STRINGS.arrivals_leg_form_arrive_label
            : M3_UI_STRINGS.arrivals_leg_form_depart_label}
        </label>
        <input
          id="leg-time"
          type="datetime-local"
          {...register(timeFieldName)}
          disabled={isBusy}
          className={inputClass}
        />
        {/* #477: the required-time refine attaches to the direction's
            field — one calm inline line per the #209 error-surface
            contract. */}
        {timeError?.message ? (
          <p role="alert" className={cn(ERROR_LINE_CLASS, "mt-1 text-sm")}>
            {timeError.message}
          </p>
        ) : null}
      </div>

      {/* Airport — free text, either direction */}
      <div>
        <label htmlFor="leg-airport" className={labelClass}>
          {M3_UI_STRINGS.arrivals_leg_form_airport_label}
        </label>
        <input
          id="leg-airport"
          type="text"
          {...register("airport")}
          disabled={isBusy}
          className={inputClass}
        />
      </div>

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

      {/* Coming from — inbound only (#477), optional free text */}
      {isInbound ? (
        <div>
          <label htmlFor="leg-origin" className={labelClass}>
            {M3_UI_STRINGS.arrivals_leg_form_origin_label}
          </label>
          <input
            id="leg-origin"
            type="text"
            {...register("originLabel")}
            disabled={isBusy}
            className={inputClass}
          />
        </div>
      ) : null}

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
