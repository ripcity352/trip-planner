"use client";

/**
 * CreateInviteForm — organizer-only form to mint an invite link.
 *
 * Fields: usesLeft (optional, positive int ≤ 1000), expiresAt (optional
 * datetime-local). Both fields are optional — leaving them blank means
 * "unlimited uses, no expiry" which is the most permissive shape.
 *
 * Uses react-hook-form + zod. The server action re-validates; this is a
 * UX convenience check only.
 *
 * Strings sourced from M3_UI_STRINGS / ERRORS per Override F.
 */

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS } from "@/lib/copy/errors";
import { createInviteAction } from "@/lib/actions/invites";
import { cn } from "@/lib/utils";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { callAction } from "@/lib/ui/call-action";
import { fromDatetimeLocal } from "@/lib/utils/datetime";
import type { Invite } from "@/lib/db/types";

// Form stores everything as strings (HTML form values). The schema
// validates the raw strings; we manually coerce before calling the action.
const formSchema = z.object({
  // Empty string means "no cap" (unlimited). Non-empty must be a positive
  // integer ≤ 1000 as a string — coercion happens in onSubmit.
  usesLeft: z
    .string()
    .optional()
    .refine(
      (v) => {
        if (!v || v === "") return true;
        const n = parseInt(v, 10);
        return Number.isInteger(n) && n > 0 && n <= 1000;
      },
      { message: "Must be a number between 1 and 1000" },
    ),
  expiresAt: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface CreateInviteFormProps {
  tripId: string;
  onCreated: (invite: Invite) => void;
}

export function CreateInviteForm({ tripId, onCreated }: CreateInviteFormProps) {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { usesLeft: "", expiresAt: "" },
  });

  async function onSubmit(values: FormValues) {
    setErrorMsg(null);
    // Coerce string form values to the types the action expects.
    const usesLeft =
      values.usesLeft && values.usesLeft !== ""
        ? parseInt(values.usesLeft, 10)
        : null;
    // The datetime-local input emits "YYYY-MM-DDTHH:MM" (no seconds, no
    // offset). The server's zod schema requires a full ISO-8601 string
    // (z.string().datetime()), so coerce here. Empty input → null (the
    // schema treats both as "no expiry").
    const expiresAt = fromDatetimeLocal(values.expiresAt);

    // Generate idempotency key at submit time — drunk-user double-tap
    // safety (#366, announcement-composer pattern): a transport-level
    // replay of this submit carries the same key and the DB's partial
    // unique index collapses it to one invite.
    const idempotencyKey = crypto.randomUUID();
    // #431: rejected awaits resolve to the network envelope via callAction.
    const result = await callAction(() =>
      createInviteAction({ tripId, usesLeft, expiresAt }, idempotencyKey)
    );

    if (!result.ok) {
      setErrorMsg(ERRORS[result.errorKey] ?? ERRORS.network);
      return;
    }

    reset();
    onCreated(result.invite);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invite-uses-left">
          {M3_UI_STRINGS.invitesForm_max_uses_label}
        </Label>
        <Input
          id="invite-uses-left"
          type="number"
          min={1}
          max={1000}
          placeholder={M3_UI_STRINGS.invitesForm_max_uses_placeholder}
          {...register("usesLeft")}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invite-expires-at">
          {M3_UI_STRINGS.invitesForm_expires_label}
        </Label>
        <Input
          id="invite-expires-at"
          type="datetime-local"
          placeholder={M3_UI_STRINGS.invitesForm_expires_placeholder}
          {...register("expiresAt")}
        />
      </div>

      {errorMsg && (
        <p role="alert" className={cn(ERROR_LINE_CLASS, "text-sm")}>
          {errorMsg}
        </p>
      )}

      <Button
        type="submit"
        disabled={isSubmitting}
        className="h-11"
      >
        {M3_UI_STRINGS.invitesForm_submit}
      </Button>
    </form>
  );
}
