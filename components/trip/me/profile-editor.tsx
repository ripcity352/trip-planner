"use client";

/**
 * ProfileEditor (#368 / #262 name half) — the /me self-service identity
 * affordance. A quiet "Edit" button on the profile card expands into an
 * inline panel (the AddExpenseSheet show/hide pattern — no modal, no
 * animation lib) with two fields:
 *
 *   - Name — what the crew calls you (per-trip, trip_members.display_name)
 *   - Phone — OPT-IN (rule 8), one honest hint: it powers the roster's
 *     contact download. No asterisk, no completion pressure — the
 *     "complete your profile" pattern is hard-banned.
 *
 * On save the page's server-rendered rows refresh via router.refresh();
 * the action's layout-scope revalidation covers the roster/announcement
 * author names.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { callAction } from "@/lib/ui/call-action";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { updateMyProfileAction } from "@/lib/actions/profile";
import { normalizePhoneE164 } from "@/lib/utils/phone";
import { DISPLAY_NAME_MAX_LENGTH } from "@/lib/utils/member-display";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import { FIELD_ERRORS } from "@/lib/copy/field-errors";
import { M5_UI_STRINGS } from "@/lib/copy/empty-states";

const profileFormSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, FIELD_ERRORS.profile_name_required)
    .max(DISPLAY_NAME_MAX_LENGTH, FIELD_ERRORS.profile_name_too_long),
  phone: z
    .string()
    .trim()
    .max(32, FIELD_ERRORS.profile_phone_invalid)
    // Empty is a first-class value (clears the number); anything else
    // must survive the same normalizer the server applies.
    .refine(
      (v) => v === "" || normalizePhoneE164(v) !== null,
      FIELD_ERRORS.profile_phone_invalid
    ),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

export interface ProfileEditorProps {
  /** Trip UUID (not the slug) — the action scopes by it. */
  tripId: string;
  /** Stored display_name — empty string when unset. */
  initialName: string;
  /** Stored E.164 phone — empty string when unset. */
  initialPhone: string;
  className?: string;
}

export function ProfileEditor({
  tripId,
  initialName,
  initialPhone,
  className,
}: ProfileEditorProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [errorKey, setErrorKey] = React.useState<ErrorKey | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: { displayName: initialName, phone: initialPhone },
  });

  const close = () => {
    setOpen(false);
    setErrorKey(null);
    reset({ displayName: initialName, phone: initialPhone });
  };

  const onSubmit = handleSubmit(async (values) => {
    setErrorKey(null);
    // #431: rejected awaits resolve to the network envelope via callAction.
    const result = await callAction(() =>
      updateMyProfileAction(
        {
          tripId,
          displayName: values.displayName,
          phone: values.phone,
        },
        crypto.randomUUID()
      )
    );
    if (!result.ok) {
      setErrorKey(result.errorKey);
      return;
    }
    setOpen(false);
    setErrorKey(null);
    // Seed the next open with what the server actually stored (the
    // normalized phone, not the raw keystrokes).
    reset({
      displayName: result.displayName,
      phone: result.phoneE164 ?? "",
    });
    router.refresh();
  });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={M5_UI_STRINGS.meProfile_edit_aria}
        className={cn(
          "focus-visible:ring-ring rounded-xs border border-border bg-muted px-3 py-1.5 text-xs font-medium",
          "hover:bg-muted/80 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
          className
        )}
      >
        {M5_UI_STRINGS.meProfile_edit_cta}
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className={cn(
        "flex w-full flex-col gap-3 rounded-xs border border-border bg-card p-3",
        className
      )}
    >
      <h3 className="text-sm font-medium">
        {M5_UI_STRINGS.meProfile_heading}
      </h3>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-display-name">
          {M5_UI_STRINGS.meProfile_name_label}
        </Label>
        <Input
          id="profile-display-name"
          autoComplete="name"
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          aria-invalid={errors.displayName ? true : undefined}
          aria-describedby={
            errors.displayName ? "profile-display-name-error" : undefined
          }
          {...register("displayName")}
        />
        {errors.displayName?.message ? (
          <p
            id="profile-display-name-error"
            role="alert"
            className={cn(ERROR_LINE_CLASS, "text-xs")}
          >
            {errors.displayName.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-phone">
          {M5_UI_STRINGS.meProfile_phone_label}
        </Label>
        <Input
          id="profile-phone"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          placeholder={M5_UI_STRINGS.meProfile_phone_placeholder}
          aria-invalid={errors.phone ? true : undefined}
          aria-describedby={
            errors.phone ? "profile-phone-error" : "profile-phone-hint"
          }
          {...register("phone")}
        />
        <p id="profile-phone-hint" className="text-muted-foreground text-xs">
          {M5_UI_STRINGS.meProfile_phone_hint}
        </p>
        {errors.phone?.message ? (
          <p
            id="profile-phone-error"
            role="alert"
            className={cn(ERROR_LINE_CLASS, "text-xs")}
          >
            {errors.phone.message}
          </p>
        ) : null}
      </div>

      {errorKey ? (
        <p role="alert" className={cn(ERROR_LINE_CLASS, "text-xs")}>
          {ERRORS[errorKey] ?? ERRORS.network}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className={cn(
            "focus-visible:ring-ring rounded-xs border border-border bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground",
            "hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-60"
          )}
        >
          {M5_UI_STRINGS.meProfile_submit}
        </button>
        <button
          type="button"
          onClick={close}
          disabled={isSubmitting}
          className={cn(
            "focus-visible:ring-ring rounded-xs px-3 py-1.5 text-xs font-medium text-muted-foreground",
            "hover:bg-muted focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-60"
          )}
        >
          {M5_UI_STRINGS.meProfile_cancel}
        </button>
      </div>
    </form>
  );
}
