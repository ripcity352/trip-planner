"use client";

/**
 * AddItemForm — organizer-only form to create an itinerary item.
 *
 * Bottom-sheet triggered by the organizer. Fields match the Wave 1
 * addItineraryItem action schema: title, kind, day (starts_at), ends_at,
 * address, dress_code, visibility, activity_tag.
 *
 * Uses react-hook-form + zod for client-side validation. The server
 * action does its own zod validation too (defense-in-depth).
 *
 * No new dependencies — uses existing react-hook-form + zod in the project.
 */

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { callAction } from "@/lib/ui/call-action";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import { addItineraryItem } from "@/lib/actions/itinerary";
import type { ItineraryItem } from "@/lib/db/types";

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
  address: z.string().trim().max(500).optional(),
  dressCode: z.string().trim().max(200).optional(),
  visibility: z.enum(VISIBILITY_OPTIONS),
  activityTags: z.string().trim().optional(), // comma-separated → parsed on submit
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

export interface AddItemFormProps {
  tripId: string;
  onSuccess: (item?: ItineraryItem) => void;
  onCancel: () => void;
}

export function AddItemForm({ tripId, onSuccess, onCancel }: AddItemFormProps) {
  const [serverErrorKey, setServerErrorKey] = React.useState<ErrorKey | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      kind: "activity",
      visibility: "everyone",
    },
  });

  const onSubmit = async (values: FormValues) => {
    setServerErrorKey(null);
    const idempotencyKey = crypto.randomUUID();

    const activityTag = values.activityTags
      ? values.activityTags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

    // #431: rejected awaits resolve to the network envelope via callAction.
    const result = await callAction(() =>
      addItineraryItem(
        {
          tripId,
          title: values.title,
          kind: values.kind,
          day: values.day,
          address: values.address || null,
          dressCode: values.dressCode || null,
          visibility: values.visibility,
          activityTag,
        },
        idempotencyKey
      )
    );

    if (!result.ok) {
      setServerErrorKey(result.errorKey);
      return;
    }

    reset();
    onSuccess(result.item);
  };

  const inputClass = cn(
    "w-full rounded-xs border border-border bg-background px-3 py-2 text-sm",
    "placeholder:text-muted-foreground",
    "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
    "disabled:cursor-not-allowed disabled:opacity-60"
  );

  const labelClass = "block text-sm font-medium text-foreground mb-1";

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      {/* Title */}
      <div>
        <label htmlFor="add-title" className={labelClass}>
          {M3_UI_STRINGS.itineraryForm_title_label}
        </label>
        <input
          id="add-title"
          type="text"
          {...register("title")}
          disabled={isSubmitting}
          className={inputClass}
        />
        {errors.title ? (
          <p className={cn(ERROR_LINE_CLASS, "mt-1 text-xs")}>{errors.title.message}</p>
        ) : null}
      </div>

      {/* Kind */}
      <div>
        <label htmlFor="add-kind" className={labelClass}>
          {M3_UI_STRINGS.itineraryForm_kind_label}
        </label>
        <select
          id="add-kind"
          {...register("kind")}
          disabled={isSubmitting}
          className={inputClass}
        >
          {ITEM_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </div>

      {/* Day (starts_at) */}
      <div>
        <label htmlFor="add-day" className={labelClass}>
          {M3_UI_STRINGS.itineraryForm_starts_label}
        </label>
        <input
          id="add-day"
          type="date"
          {...register("day")}
          disabled={isSubmitting}
          className={inputClass}
        />
        {errors.day ? (
          <p className={cn(ERROR_LINE_CLASS, "mt-1 text-xs")}>{errors.day.message}</p>
        ) : null}
      </div>

      {/* Address */}
      <div>
        <label htmlFor="add-address" className={labelClass}>
          {M3_UI_STRINGS.itineraryForm_address_label}
        </label>
        <input
          id="add-address"
          type="text"
          {...register("address")}
          placeholder={M3_UI_STRINGS.itineraryForm_address_placeholder}
          disabled={isSubmitting}
          className={inputClass}
        />
      </div>

      {/* Dress code */}
      <div>
        <label htmlFor="add-dress" className={labelClass}>
          {M3_UI_STRINGS.itineraryForm_dress_label}
        </label>
        <input
          id="add-dress"
          type="text"
          {...register("dressCode")}
          disabled={isSubmitting}
          className={inputClass}
        />
      </div>

      {/* Activity tags (comma-separated) */}
      <div>
        <label htmlFor="add-tags" className={labelClass}>
          {M3_UI_STRINGS.itineraryForm_tags_label}
        </label>
        <input
          id="add-tags"
          type="text"
          {...register("activityTags")}
          placeholder={M3_UI_STRINGS.itineraryForm_tags_placeholder}
          disabled={isSubmitting}
          className={inputClass}
        />
      </div>

      {/* Visibility */}
      <div>
        <label htmlFor="add-visibility" className={labelClass}>
          {M3_UI_STRINGS.itineraryForm_visibility_label}
        </label>
        <select
          id="add-visibility"
          {...register("visibility")}
          disabled={isSubmitting}
          className={inputClass}
        >
          {VISIBILITY_OPTIONS.map((v) => (
            <option key={v} value={v}>
              {VISIBILITY_LABELS[v]}
            </option>
          ))}
        </select>
      </div>

      {/* Server error */}
      {serverErrorKey ? (
        <p role="alert" className={cn(ERROR_LINE_CLASS, "text-sm")}>
          {ERRORS[serverErrorKey]}
        </p>
      ) : null}

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className={cn(
            "focus-visible:ring-ring rounded-xs bg-primary px-5 py-2 text-sm font-medium text-primary-foreground",
            "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-60"
          )}
        >
          {M3_UI_STRINGS.itineraryForm_submit_add}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className={cn(
            "focus-visible:ring-ring rounded-xs border border-border bg-muted px-5 py-2 text-sm font-medium text-muted-foreground",
            "hover:bg-muted/80 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-60"
          )}
        >
          {M3_UI_STRINGS.itineraryForm_cancel}
        </button>
      </div>
    </form>
  );
}
