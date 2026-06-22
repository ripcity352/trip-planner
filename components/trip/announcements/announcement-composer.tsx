"use client";

/**
 * AnnouncementComposer — organizer-only announcement post form.
 *
 * Hidden entirely for non-organizers (no caption rendered — see brief:
 * "recommend: hide entirely since the caption is informational, not a
 * blocker"). Visibility choices are the three MVP values; "custom" is
 * excluded.
 *
 * Idempotency key is generated fresh at submit time — NOT at mount time
 * — to handle a drunk-user double-tap correctly.
 */

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { postAnnouncement } from "@/lib/actions/announcements";
import { cn } from "@/lib/utils";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { ERRORS } from "@/lib/copy/errors";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import type { TripVisibility } from "@/lib/db/types";

// MVP visibility options — "custom" excluded
const VISIBILITY_OPTIONS: { value: Exclude<TripVisibility, "custom">; label: string }[] = [
  { value: "everyone", label: M3_UI_STRINGS.itineraryForm_visibility_everyone },
  { value: "organizers_only", label: M3_UI_STRINGS.itineraryForm_visibility_organizers },
  { value: "hide_from_celebrant", label: M3_UI_STRINGS.itineraryForm_visibility_hide_celebrant },
];

const composerSchema = z.object({
  body: z.string().trim().min(1, "Body is required").max(5000),
  visibility: z.enum(["everyone", "organizers_only", "hide_from_celebrant"]),
});

type ComposerFormValues = z.infer<typeof composerSchema>;

interface AnnouncementComposerProps {
  tripId: string;
  isOrganizer: boolean;
}

export function AnnouncementComposer({
  tripId,
  isOrganizer,
}: AnnouncementComposerProps) {
  // Non-organizers: hide entirely
  if (!isOrganizer) return null;

  return <ComposerForm tripId={tripId} />;
}

function ComposerForm({ tripId }: { tripId: string }) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<ComposerFormValues["visibility"]>("everyone");

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { isSubmitting },
  } = useForm<ComposerFormValues>({
    resolver: zodResolver(composerSchema),
    defaultValues: {
      body: "",
      visibility: "everyone",
    },
  });

  async function onSubmit(values: ComposerFormValues) {
    setErrorMessage(null);
    // Generate idempotency key at submit time — drunk-user double-tap safety
    const idempotencyKey = crypto.randomUUID();

    const result = await postAnnouncement(
      {
        tripId,
        body: values.body,
        visibility: values.visibility,
      },
      idempotencyKey
    );

    if (!result.ok) {
      setErrorMessage(ERRORS[result.errorKey]);
      return;
    }

    reset();
    setVisibility("everyone");
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-4"
      noValidate
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="announcement-body" className="sr-only">
          {M3_UI_STRINGS.announcements_compose_placeholder}
        </Label>
        <Textarea
          id="announcement-body"
          placeholder={M3_UI_STRINGS.announcements_compose_placeholder}
          rows={3}
          {...register("body")}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="announcement-visibility">
          {M3_UI_STRINGS.announcements_compose_visibility_label}
        </Label>
        <Select
          value={visibility}
          onValueChange={(v) => {
            const vis = v as ComposerFormValues["visibility"];
            setVisibility(vis);
            setValue("visibility", vis);
          }}
        >
          <SelectTrigger id="announcement-visibility">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VISIBILITY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {errorMessage && (
        <p role="alert" className={cn(ERROR_LINE_CLASS, "text-sm")}>
          {errorMessage}
        </p>
      )}

      <div className="flex gap-2">
        <Button
          type="submit"
          size="lg"
          disabled={isSubmitting}
          className="flex-1"
        >
          {M3_UI_STRINGS.announcements_compose_submit}
        </Button>
      </div>
    </form>
  );
}
