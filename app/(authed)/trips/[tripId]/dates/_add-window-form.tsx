"use client";

/**
 * Add-window form (organizer/celebrant only). Renders inline below
 * the candidate list. Submit calls `proposeDateCandidatesAction`
 * with a single candidate; success closes the form and relies on
 * the realtime channel to refresh the list.
 *
 * Max-windows cap is enforced server-side; the form surfaces the
 * cap message inline when the action returns validation_failed.
 */

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { M2_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import { proposeDateCandidatesAction } from "@/lib/actions/date-poll";
import { cn } from "@/lib/utils";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";

interface AddWindowFormProps {
  tripId: string;
  atCap: boolean;
}

export function AddWindowForm({ tripId, atCap }: AddWindowFormProps) {
  const [open, setOpen] = React.useState(false);
  const [label, setLabel] = React.useState("");
  const [startsOn, setStartsOn] = React.useState("");
  const [endsOn, setEndsOn] = React.useState("");
  const [errorKey, setErrorKey] = React.useState<ErrorKey | null>(null);
  const [isPending, startTransition] = React.useTransition();

  if (atCap) {
    return (
      <p className={cn(ERROR_LINE_CLASS, "text-sm")} role="status">
        {M2_UI_STRINGS.datePoll_max_windows_reached}
      </p>
    );
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          setOpen(true);
          setErrorKey(null);
        }}
      >
        {M2_UI_STRINGS.datePoll_add_window_cta}
      </Button>
    );
  }

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = (e) => {
    e.preventDefault();
    if (!label || !startsOn || !endsOn) {
      setErrorKey("validation_failed");
      return;
    }
    const idempotencyKey = crypto.randomUUID();
    startTransition(async () => {
      try {
        const result = await proposeDateCandidatesAction(
          {
            tripId,
            candidates: [{ label, starts_on: startsOn, ends_on: endsOn }],
          },
          idempotencyKey
        );
        if (!result.ok) {
          setErrorKey(result.errorKey);
          return;
        }
        // Success: reset + close. Realtime will fold the new row in.
        setOpen(false);
        setLabel("");
        setStartsOn("");
        setEndsOn("");
        setErrorKey(null);
      } catch (err) {
        console.error("[date-poll] proposeDateCandidates threw:", err);
        setErrorKey("network");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="date-poll-label">
          {M2_UI_STRINGS.datePoll_add_form_label_label}
        </Label>
        <Input
          id="date-poll-label"
          name="label"
          value={label}
          onChange={(e) => setLabel(e.currentTarget.value)}
          maxLength={80}
          autoComplete="off"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="date-poll-start">
            {M2_UI_STRINGS.datePoll_add_form_start_label}
          </Label>
          <Input
            id="date-poll-start"
            name="starts_on"
            type="date"
            value={startsOn}
            onChange={(e) => setStartsOn(e.currentTarget.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="date-poll-end">
            {M2_UI_STRINGS.datePoll_add_form_end_label}
          </Label>
          <Input
            id="date-poll-end"
            name="ends_on"
            type="date"
            value={endsOn}
            onChange={(e) => setEndsOn(e.currentTarget.value)}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={isPending}>
          {M2_UI_STRINGS.datePoll_add_form_submit}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={isPending}
          onClick={() => {
            setOpen(false);
            setErrorKey(null);
          }}
        >
          {M2_UI_STRINGS.datePoll_add_form_cancel}
        </Button>
      </div>
      {errorKey ? (
        <p role="alert" className={cn(ERROR_LINE_CLASS, "text-sm")}>
          {ERRORS[errorKey]}
        </p>
      ) : null}
    </form>
  );
}
