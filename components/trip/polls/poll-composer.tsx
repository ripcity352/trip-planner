"use client";

/**
 * PollComposer (#390) — organizer-only "Put it to the crew" affordance.
 *
 * Hidden entirely for non-organizers (mirrors AnnouncementComposer —
 * the affordance is informational, not a blocker; rule 11 says no
 * access-denied surfaces). Starts collapsed as a single CTA; expands
 * to question + 2–4 options + optional close date + visibility select.
 *
 * Idempotency key is generated at submit time — drunk-double-tap safety.
 * Empty extra option fields are forgiven (trimmed + filtered) so an
 * organizer who added a fourth field and left it blank isn't scolded.
 */

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createPollAction } from "@/lib/actions/polls";
import { cn } from "@/lib/utils";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { ERRORS } from "@/lib/copy/errors";
import { M3_UI_STRINGS, M5_UI_STRINGS } from "@/lib/copy/empty-states";
import type { TripVisibility } from "@/lib/db/types";

// MVP visibility options — "custom" excluded (mirrors the
// announcements composer).
const VISIBILITY_OPTIONS: {
  value: Exclude<TripVisibility, "custom">;
  label: string;
}[] = [
  { value: "everyone", label: M3_UI_STRINGS.itineraryForm_visibility_everyone },
  {
    value: "organizers_only",
    label: M3_UI_STRINGS.itineraryForm_visibility_organizers,
  },
  {
    value: "hide_from_celebrant",
    label: M3_UI_STRINGS.itineraryForm_visibility_hide_celebrant,
  },
];

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 4;

// No inline zod messages — the form surfaces ERRORS.validation_failed
// from lib/copy on any issue, so per-field strings would be dead copy.
const composerSchema = z
  .object({
    question: z.string().trim().min(1).max(280),
    // Fixed-slot array (2–4 rendered inputs); blanks are forgiven and
    // filtered at submit — the superRefine enforces ≥2 filled.
    options: z.array(z.string().trim().max(80)),
    closesOn: z.string(),
    visibility: z.enum(["everyone", "organizers_only", "hide_from_celebrant"]),
  })
  .superRefine((values, ctx) => {
    const filled = values.options.filter((o) => o.length > 0);
    if (filled.length < MIN_OPTIONS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
      });
    }
  });

type ComposerFormValues = z.infer<typeof composerSchema>;

interface PollComposerProps {
  tripId: string;
  isOrganizer: boolean;
  /**
   * F2: called after a successful create, in addition to the server
   * revalidate — the section's PulsePoll `refetch`, so the composer's
   * own view shows the new poll without waiting on Realtime.
   */
  onCreated?: () => void;
}

export function PollComposer({
  tripId,
  isOrganizer,
  onCreated,
}: PollComposerProps) {
  // Non-organizers: hide entirely.
  if (!isOrganizer) return null;

  return <ComposerDisclosure tripId={tripId} onCreated={onCreated} />;
}

function ComposerDisclosure({
  tripId,
  onCreated,
}: {
  tripId: string;
  onCreated?: () => void;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full"
        onClick={() => setOpen(true)}
      >
        {M5_UI_STRINGS.polls_composer_cta}
      </Button>
    );
  }

  return (
    <ComposerForm
      tripId={tripId}
      onCreated={onCreated}
      onClose={() => setOpen(false)}
    />
  );
}

function ComposerForm({
  tripId,
  onCreated,
  onClose,
}: {
  tripId: string;
  onCreated?: () => void;
  onClose: () => void;
}) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [visibility, setVisibility] =
    useState<ComposerFormValues["visibility"]>("everyone");
  const [optionCount, setOptionCount] = useState(MIN_OPTIONS);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { isSubmitting, errors },
  } = useForm<ComposerFormValues>({
    resolver: zodResolver(composerSchema),
    defaultValues: {
      question: "",
      options: Array.from({ length: MAX_OPTIONS }, () => ""),
      closesOn: "",
      visibility: "everyone",
    },
  });

  async function onSubmit(values: ComposerFormValues) {
    setErrorMessage(null);
    // Only the rendered slots count; blanks are forgiven.
    const options = values.options
      .slice(0, optionCount)
      .map((o) => o.trim())
      .filter((o) => o.length > 0);

    // Generate the idempotency key at submit time — double-tap safety.
    const idempotencyKey = crypto.randomUUID();

    const result = await createPollAction(
      {
        tripId,
        question: values.question,
        options,
        closesOn: values.closesOn ? values.closesOn : null,
        visibility: values.visibility,
      },
      idempotencyKey
    );

    if (!result.ok) {
      setErrorMessage(ERRORS[result.errorKey]);
      return;
    }

    onCreated?.();
    onClose();
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="border-border bg-card flex flex-col gap-3 rounded-sm border px-4 py-4"
      noValidate
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="poll-question">
          {M5_UI_STRINGS.pollsForm_question_label}
        </Label>
        <Input
          id="poll-question"
          placeholder={M5_UI_STRINGS.pollsForm_question_placeholder}
          {...register("question")}
        />
      </div>

      {Array.from({ length: optionCount }, (_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <Label htmlFor={`poll-option-${i}`}>
            {M5_UI_STRINGS.pollsForm_option_label_template.replace(
              "{n}",
              String(i + 1)
            )}
          </Label>
          <Input id={`poll-option-${i}`} {...register(`options.${i}`)} />
        </div>
      ))}

      {optionCount < MAX_OPTIONS ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => setOptionCount((n) => Math.min(n + 1, MAX_OPTIONS))}
        >
          {M5_UI_STRINGS.pollsForm_add_option}
        </Button>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="poll-closes-on">
          {M5_UI_STRINGS.pollsForm_closes_label}
        </Label>
        <Input id="poll-closes-on" type="date" {...register("closesOn")} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="poll-visibility">
          {M5_UI_STRINGS.pollsForm_visibility_label}
        </Label>
        <Select
          value={visibility}
          onValueChange={(v) => {
            const vis = v as ComposerFormValues["visibility"];
            setVisibility(vis);
            setValue("visibility", vis);
          }}
        >
          <SelectTrigger id="poll-visibility">
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

      {errors.options || errors.question ? (
        <p role="alert" className={cn(ERROR_LINE_CLASS, "text-sm")}>
          {ERRORS.validation_failed}
        </p>
      ) : null}
      {errorMessage ? (
        <p role="alert" className={cn(ERROR_LINE_CLASS, "text-sm")}>
          {errorMessage}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" size="lg" disabled={isSubmitting} className="flex-1">
          {M5_UI_STRINGS.pollsForm_submit}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="lg"
          onClick={onClose}
          disabled={isSubmitting}
        >
          {M5_UI_STRINGS.pollsForm_cancel}
        </Button>
      </div>
    </form>
  );
}
