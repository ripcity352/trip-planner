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
import {
  upsertTravelLeg,
  deleteTravelLeg,
  tagCoTravelersAction,
} from "@/lib/actions/travel-legs";
import type { TravelLeg, TravelLegDirection } from "@/lib/db/types";
import { AirlinePicker } from "./airline-picker";

/** #574 — a member who can be tagged onto a shared flight. */
export interface TagCandidate {
  /** trip_member_id. */
  id: string;
  name: string;
}

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
  /**
   * Save passes the persisted leg (#525 — the sheet derives day-chip
   * suggestions from it); delete passes nothing.
   */
  onSuccess: (savedLeg?: TravelLeg) => void;
  onCancel: () => void;
  /**
   * #574 — members who can be tagged onto a shared flight (all trip members
   * except the viewer + trip-level decliners; server-composed). When present
   * and the leg is a flight in ADD mode, a "who else is on this flight?"
   * multi-select renders; on save, each selected member gets a pending,
   * attributed leg they confirm. Omit (or empty) to hide the picker.
   */
  tagCandidates?: ReadonlyArray<TagCandidate>;
}

export function TravelLegForm({
  tripId,
  leg,
  direction: directionProp,
  tripTimezone,
  onSuccess,
  onCancel,
  tagCandidates,
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

  // #574 — selected co-travelers to tag onto this (flight, add-mode) leg.
  const [selectedTagIds, setSelectedTagIds] = React.useState<
    ReadonlyArray<string>
  >([]);
  // #574 follow-up — "whose flight is this?" ("" = yours; else a member id).
  // Picking a member logs the whole flight on their behalf (attributed, they
  // confirm) instead of creating your own leg. Add-mode + flight only.
  const [forMemberId, setForMemberId] = React.useState("");
  // If the self-leg saved but the tag fan-out failed, the form stays open;
  // this records the saved leg's id so a retry UPDATES it (no duplicate own
  // leg) rather than inserting a second one.
  const [savedLegId, setSavedLegId] = React.useState<string | null>(null);
  // Stable idempotency key for the tag fan-out across retries within this
  // form session — a retry replays (per-target 23505) instead of creating
  // duplicate pending tags. Lazily initialised (crypto is client-only).
  const tagIdemKeyRef = React.useRef<string | null>(null);
  if (tagIdemKeyRef.current === null) {
    tagIdemKeyRef.current = crypto.randomUUID();
  }
  // #574 follow-up — the on-behalf ("whose flight") write gets its OWN stable
  // key, independent of the co-traveler fan-out, so the two paths never share
  // an idempotency key for the same target (which could replay-skip a write).
  const behalfIdemKeyRef = React.useRef<string | null>(null);
  if (behalfIdemKeyRef.current === null) {
    behalfIdemKeyRef.current = crypto.randomUUID();
  }

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

    // #477: each direction records ONLY its trip-city-side instant. These
    // are the shareable facts a co-traveler tag copies too (#574).
    const departAt = isInbound
      ? null
      : fromLocalInputValue(values.departAt ?? "", tripTimezone);
    const arriveAt = isInbound
      ? fromLocalInputValue(values.arriveAt ?? "", tripTimezone)
      : null;
    const airport = values.airport || null;
    const originLabel = isInbound ? values.originLabel || null : null;
    const carrier = values.carrier || null;
    const airlineIata = isFlight ? values.airlineIata || null : null;
    const flightNumber = isFlight ? values.flightNumber || null : null;

    // #574 follow-up — logging a whole flight on another member's behalf.
    // Route the leg to them via the attributed on-behalf path (they confirm)
    // instead of creating a self-leg. Flight-only + add-mode. No PNR/notes go
    // on-behalf (#505). The zod resolver already enforced the required time.
    if (!isEditMode && isFlight && forMemberId !== "") {
      const behalfResult = await callAction(() =>
        tagCoTravelersAction(
          {
            tripId,
            targetTripMemberIds: [forMemberId],
            kind: "flight",
            direction,
            departAt,
            arriveAt,
            airport,
            originLabel,
            carrier,
            airlineIata,
            flightNumber,
          },
          behalfIdemKeyRef.current as string
        )
      );
      if (!behalfResult.ok) {
        setServerErrorKey(behalfResult.errorKey);
        return;
      }
      onSuccess();
      return;
    }

    // #574: on retry after a tag failure, savedLegId updates the already-
    // saved own leg rather than inserting a duplicate.
    const effectiveLegId = isEditMode ? leg.id : savedLegId;

    // #431: rejected awaits resolve to the network envelope via callAction.
    const result = await callAction(() =>
      upsertTravelLeg(
        {
          tripId,
          kind: values.kind,
          direction,
          departAt,
          arriveAt,
          airport,
          // #477: originLabel is inbound-only — mirror of the #248 pattern.
          originLabel,
          carrier,
          confirmationCode: values.confirmationCode || null,
          notes: values.notes || null,
          legId: effectiveLegId ?? undefined,
          // M4 W2c additions — only sent when kind === "flight" (#248)
          airlineIata,
          flightNumber,
        },
        idempotencyKey
      )
    );

    if (!result.ok) {
      setServerErrorKey(result.errorKey);
      return;
    }

    // #574: fan out attributed pending legs to any tagged co-travelers.
    // Flight-only + add-mode + at least one selected. The self-leg is
    // already saved; a tag failure keeps the form open (savedLegId guards a
    // duplicate own leg on retry) so the error is actionable, not silently
    // dropped.
    if (canTag && selectedTagIds.length > 0) {
      const tagResult = await callAction(() =>
        tagCoTravelersAction(
          {
            tripId,
            targetTripMemberIds: [...selectedTagIds],
            kind: "flight",
            direction,
            departAt,
            arriveAt,
            airport,
            originLabel,
            carrier,
            airlineIata,
            flightNumber,
          },
          tagIdemKeyRef.current as string
        )
      );

      if (!tagResult.ok) {
        setSavedLegId(result.leg.id);
        setServerErrorKey(tagResult.errorKey);
        return;
      }
    }

    onSuccess(result.leg);
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

  // On-behalf is flight-only; if the kind switches off flight, drop any
  // "whose flight" selection so a stale value can't misroute a non-flight leg.
  React.useEffect(() => {
    if (kind !== "flight") setForMemberId("");
  }, [kind]);

  // Drop the selection if the candidate set ever stops including it, so a
  // stale id can never reach the action (server would reject anyway).
  React.useEffect(() => {
    if (forMemberId && !tagCandidates?.some((c) => c.id === forMemberId)) {
      setForMemberId("");
    }
  }, [forMemberId, tagCandidates]);

  const hasCandidates = (tagCandidates?.length ?? 0) > 0;
  // #574 follow-up — the "whose flight?" selector (add-mode flight w/ members).
  const canChooseOwner = !isEditMode && kind === "flight" && hasCandidates;
  // Logging someone else's flight → the confirmation/notes and the "anyone
  // else" picker don't apply (single attributed leg for that member).
  const isForSomeoneElse = canChooseOwner && forMemberId !== "";

  // #574: the co-traveler picker shows only when logging YOUR OWN new flight
  // (editing re-shares nothing; non-flights are out of scope; when it's
  // someone else's flight the whole leg is theirs). Also gates the fan-out.
  const canTag = canChooseOwner && forMemberId === "";

  const toggleTag = (id: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

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
      {/* #574 follow-up — whose flight this is. Default "Yours"; picking a
          member logs the whole flight on their behalf (they confirm). */}
      {canChooseOwner ? (
        <div>
          <label htmlFor="leg-whose" className={labelClass}>
            {M3_UI_STRINGS.arrivals_leg_form_whose_label}
          </label>
          <select
            id="leg-whose"
            value={forMemberId}
            onChange={(e) => setForMemberId(e.target.value)}
            disabled={isBusy}
            className={inputClass}
          >
            <option value="">{M3_UI_STRINGS.arrivals_leg_form_whose_you}</option>
            {tagCandidates?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

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

      {/* #574 — tag co-travelers on this shared flight. Add-mode + flight
          only; each checked member gets a pending, attributed leg they
          confirm on their own arrivals view. */}
      {canTag ? (
        <fieldset className="flex flex-col gap-2">
          <legend className={labelClass}>
            {M3_UI_STRINGS.arrivals_tag_cotravelers_label}
          </legend>
          <div className="flex flex-wrap gap-2">
            {tagCandidates?.map((candidate) => {
              const checked = selectedTagIds.includes(candidate.id);
              return (
                <label
                  key={candidate.id}
                  className={cn(
                    "focus-within:ring-ring inline-flex cursor-pointer items-center gap-2 rounded-xs border px-3 py-1.5 text-sm",
                    "focus-within:ring-2 focus-within:ring-offset-2",
                    checked
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-background text-muted-foreground",
                    isBusy && "cursor-not-allowed opacity-60"
                  )}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    disabled={isBusy}
                    onChange={() => toggleTag(candidate.id)}
                  />
                  {candidate.name}
                </label>
              );
            })}
          </div>
          <p className="text-muted-foreground text-xs">
            {M3_UI_STRINGS.arrivals_tag_cotravelers_hint}
          </p>
        </fieldset>
      ) : null}

      {/* Confirmation code + Notes — omitted when logging on someone else's
          behalf: the PNR is theirs to enter (#505) and notes are personal. */}
      {!isForSomeoneElse ? (
        <>
          <div>
            <label htmlFor="leg-confirmation" className={labelClass}>
              {M3_UI_STRINGS.arrivals_leg_form_confirmation_label}
            </label>
            <input
              id="leg-confirmation"
              type="text"
              aria-describedby="leg-confirmation-hint"
              {...register("confirmationCode")}
              disabled={isBusy}
              className={inputClass}
            />
            {/* #505: the code is owner-only (travel_legs_manifest view nulls
                it for the rest of the trip) — tell the person typing it. */}
            <p
              id="leg-confirmation-hint"
              className="text-muted-foreground text-xs"
            >
              {M3_UI_STRINGS.arrivals_leg_form_confirmation_hint}
            </p>
          </div>

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
        </>
      ) : null}

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
