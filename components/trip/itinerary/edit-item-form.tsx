"use client";

/**
 * EditItemForm — organizer-only form to update or delete an itinerary item.
 *
 * W2b: added startTime / endTime fields (UTC ISO-8601) rendered via the
 * trip's timezone. tripTimezone is a new required prop.
 */

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import { updateItineraryItem, deleteItineraryItem } from "@/lib/actions/itinerary";
import type { ItineraryItem } from "@/lib/db/types";
import { DressCodeField } from "./fields/dress-code-field";
import { ActivityTagField } from "./fields/activity-tag-field";
import { AddressField } from "./fields/address-field";
import { DatetimeField } from "./fields/datetime-field";
import { DateTimeLocalFieldImpl } from "./fields/datetime-local-field-impl";

const ITEM_KINDS = [
  "event",
  "lodging",
  "transport",
  "meal",
  "activity",
] as const;

const VISIBILITY_OPTIONS = [
  "everyone",
  "organizers_only",
  "hide_from_celebrant",
] as const;

const formSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, M3_UI_STRINGS.itineraryForm_validation_title_required)
    .max(200),
  kind: z.enum(ITEM_KINDS),
  day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, M3_UI_STRINGS.itineraryForm_validation_day_format),
  // W2b: datetime fields — UTC ISO-8601 strings from the datetime-local widget.
  startTime: z.string().datetime({ offset: true }).nullable().optional(),
  endTime: z.string().datetime({ offset: true }).nullable().optional(),
  address: z.string().trim().max(500).optional(),
  // W2a: Places autocomplete columns (#166).
  addressPlaceId: z.string().trim().max(255).optional(),
  addressProvider: z.enum(["google"]).optional(),
  dressCode: z.string().trim().max(200).optional(),
  visibility: z.enum(VISIBILITY_OPTIONS),
  // W1b: chip picker emits string[]; server action takes string[] (#164).
  activityTags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
});

type FormValues = z.infer<typeof formSchema>;

const KIND_LABELS: Record<(typeof ITEM_KINDS)[number], string> = {
  event: M3_UI_STRINGS.itinerary_item_kind_event,
  lodging: M3_UI_STRINGS.itinerary_item_kind_lodging,
  transport: M3_UI_STRINGS.itinerary_item_kind_transport,
  meal: M3_UI_STRINGS.itinerary_item_kind_meal,
  activity: M3_UI_STRINGS.itinerary_item_kind_activity,
};

const VISIBILITY_LABELS: Record<(typeof VISIBILITY_OPTIONS)[number], string> = {
  everyone: M3_UI_STRINGS.itineraryForm_visibility_everyone,
  organizers_only: M3_UI_STRINGS.itineraryForm_visibility_organizers,
  hide_from_celebrant: M3_UI_STRINGS.itineraryForm_visibility_hide_celebrant,
};

export interface EditItemFormProps {
  item: ItineraryItem;
  /** IANA timezone from `trips.timezone` — passed from the page level. */
  tripTimezone: string;
  onSuccess: (item: ItineraryItem) => void;
  onCancel: () => void;
  onDeleted: () => void;
}

export function EditItemForm({
  item,
  tripTimezone,
  onSuccess,
  onCancel,
  onDeleted,
}: EditItemFormProps) {
  const [serverErrorKey, setServerErrorKey] = React.useState<ErrorKey | null>(null);
  const [deleteConfirm, setDeleteConfirm] = React.useState(false);
  const [isDeleting, startDeleteTransition] = React.useTransition();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: item.title,
      kind: item.kind,
      day: item.day,
      startTime: item.start_time ?? null,
      endTime: item.end_time ?? null,
      address: item.address ?? "",
      addressPlaceId: item.address_place_id ?? undefined,
      addressProvider: (item.address_provider as "google" | undefined) ?? undefined,
      dressCode: item.dress_code ?? "",
      visibility:
        (item.visibility as (typeof VISIBILITY_OPTIONS)[number]) ?? "everyone",
      activityTags: item.activity_tag,
    },
  });

  const onSubmit = async (values: FormValues) => {
    setServerErrorKey(null);
    const idempotencyKey = crypto.randomUUID();

    const result = await updateItineraryItem(
      {
        itemId: item.id,
        title: values.title,
        kind: values.kind,
        day: values.day,
        startTime: values.startTime ?? null,
        endTime: values.endTime ?? null,
        address: values.address || null,
        addressPlaceId: values.addressPlaceId || null,
        addressProvider: values.addressProvider || null,
        dressCode: values.dressCode || null,
        visibility: values.visibility,
        activityTag: values.activityTags ?? [],
      },
      idempotencyKey
    );

    if (!result.ok) {
      setServerErrorKey(result.errorKey);
      return;
    }

    onSuccess(result.item);
  };

  const handleDelete = () => {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      return;
    }

    startDeleteTransition(async () => {
      const result = await deleteItineraryItem(item.id);
      if (!result.ok) {
        setServerErrorKey(result.errorKey);
        setDeleteConfirm(false);
        return;
      }
      onDeleted();
    });
  };

  const inputClass = cn(
    "w-full rounded-md border border-border bg-background px-3 py-2 text-sm",
    "placeholder:text-muted-foreground",
    "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
    "disabled:cursor-not-allowed disabled:opacity-60"
  );

  const labelClass = "block text-sm font-medium text-foreground mb-1";

  const isBusy = isSubmitting || isDeleting;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      {/* Title */}
      <div>
        <label htmlFor="edit-title" className={labelClass}>
          {M3_UI_STRINGS.itineraryForm_title_label}
        </label>
        <input
          id="edit-title"
          type="text"
          {...register("title")}
          disabled={isBusy}
          className={inputClass}
        />
        {errors.title ? (
          <p className={cn(ERROR_LINE_CLASS, "mt-1 text-xs")}>{errors.title.message}</p>
        ) : null}
      </div>

      {/* Kind */}
      <div>
        <label htmlFor="edit-kind" className={labelClass}>
          {M3_UI_STRINGS.itineraryForm_kind_label}
        </label>
        <select
          id="edit-kind"
          {...register("kind")}
          disabled={isBusy}
          className={inputClass}
        >
          {ITEM_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </div>

      {/* Start time — datetime-local widget, rendered in trip TZ */}
      <DatetimeField
        value={watch("startTime") ?? null}
        onChange={(v) => setValue("startTime", v, { shouldValidate: true })}
        disabled={isBusy}
        tripTimezone={tripTimezone}
        error={errors.startTime?.message}
      />

      {/* End time — datetime-local widget, rendered in trip TZ (W2b) */}
      <div>
        <label htmlFor="edit-endtime" className={labelClass}>
          {M3_UI_STRINGS.itineraryForm_ends_label}
        </label>
        <DateTimeLocalFieldImpl
          id="edit-endtime"
          value={watch("endTime") ?? null}
          onChange={(v) => setValue("endTime", v, { shouldValidate: true })}
          disabled={isBusy}
          tripTimezone={tripTimezone}
          error={errors.endTime?.message}
        />
      </div>

      {/* Address — W2a: places-API autocomplete widget (#166) */}
      <AddressField
        address={watch("address") ?? ""}
        addressPlaceId={watch("addressPlaceId")}
        onChange={(addr, placeId, provider) => {
          setValue("address", addr, { shouldValidate: true });
          setValue("addressPlaceId", placeId, { shouldValidate: true });
          setValue("addressProvider", provider, { shouldValidate: true });
        }}
        disabled={isBusy}
      />

      {/* Dress code — pre-split into DressCodeField (W1a will add chip picker) */}
      <DressCodeField
        value={watch("dressCode") ?? ""}
        onChange={(v) => setValue("dressCode", v)}
        disabled={isBusy}
      />

      {/* W1b: activity-tag chip picker (multi-select + freeform append) */}
      <ActivityTagField
        value={watch("activityTags") ?? []}
        onChange={(v) => setValue("activityTags", v, { shouldValidate: true })}
        disabled={isBusy}
      />

      {/* Visibility */}
      <div>
        <label htmlFor="edit-visibility" className={labelClass}>
          {M3_UI_STRINGS.itineraryForm_visibility_label}
        </label>
        <select
          id="edit-visibility"
          {...register("visibility")}
          disabled={isBusy}
          className={inputClass}
        >
          {VISIBILITY_OPTIONS.map((v) => (
            <option key={v} value={v}>
              {VISIBILITY_LABELS[v]}
            </option>
          ))}
        </select>
      </div>

      {/* Delete confirmation text */}
      {deleteConfirm ? (
        <p className="text-destructive text-sm font-medium">
          {M3_UI_STRINGS.itineraryForm_delete_confirm}
        </p>
      ) : null}

      {/* Server error */}
      {serverErrorKey ? (
        <p role="alert" className={cn(ERROR_LINE_CLASS, "text-sm")}>
          {ERRORS[serverErrorKey]}
        </p>
      ) : null}

      {/* Actions */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isBusy}
            className={cn(
              "focus-visible:ring-ring rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground",
              "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
              "disabled:cursor-not-allowed disabled:opacity-60"
            )}
          >
            {M3_UI_STRINGS.itineraryForm_submit_edit}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isBusy}
            className={cn(
              "focus-visible:ring-ring rounded-full border border-border bg-muted px-5 py-2 text-sm font-medium text-muted-foreground",
              "hover:bg-muted/80 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
              "disabled:cursor-not-allowed disabled:opacity-60"
            )}
          >
            {M3_UI_STRINGS.itineraryForm_cancel}
          </button>
        </div>

        {/* Delete — destructive action, right-aligned on desktop */}
        <button
          type="button"
          onClick={handleDelete}
          disabled={isBusy}
          className={cn(
            "focus-visible:ring-ring rounded-full border px-5 py-2 text-sm font-medium",
            "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-60",
            // #210 two-step: confirm state escalates the persimmon outline
            // (border 40%→full + a persistent wash). NOT a solid bg-destructive
            // fill — --destructive-foreground is deliberately unbound
            // (globals.css §destructive), so the solid-fill text color was a
            // no-op; the contract bans the persimmon flood regardless.
            deleteConfirm
              ? "border-destructive bg-destructive/10 text-destructive"
              : "border-destructive/40 text-destructive hover:bg-destructive/10"
          )}
        >
          {M3_UI_STRINGS.itineraryForm_delete}
        </button>
      </div>
    </form>
  );
}

