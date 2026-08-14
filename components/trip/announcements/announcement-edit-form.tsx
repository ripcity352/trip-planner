"use client";

/**
 * AnnouncementEditForm — #544 inline organizer body edit.
 *
 * Renders in place of the body `<p>` inside `AnnouncementCard` (via the
 * `editSlot` prop) when the card is in edit mode. Controlled textarea +
 * client-side trim/min/max validation, matching `AnnouncementComposer`'s
 * field-error + `ERROR_LINE_CLASS` pattern — but a bare controlled
 * textarea (not react-hook-form) since there's only one field and no
 * visibility picker to coordinate.
 *
 * `onSave` mirrors the `handlePin`/`handleDelete` shape already used by
 * `AnnouncementCardActions`: it resolves to the failure `ErrorKey`, or
 * `null` on success. The parent (`AnnouncementList`) owns the optimistic
 * update + rollback + hoisted error map, same rationale as pin/delete —
 * this component only owns its own local field-validation state and the
 * submitting flag.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import { FIELD_ERRORS } from "@/lib/copy/field-errors";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";

export interface AnnouncementEditFormProps {
  initialBody: string;
  /** Returns the failure key, or null on success. */
  onSave: (body: string) => Promise<ErrorKey | null>;
  onCancel: () => void;
}

export function AnnouncementEditForm({
  initialBody,
  onSave,
  onCancel,
}: AnnouncementEditFormProps) {
  const [body, setBody] = useState(initialBody);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<ErrorKey | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSave() {
    const trimmed = body.trim();
    if (!trimmed) {
      setFieldError(FIELD_ERRORS.announcement_body_required);
      return;
    }
    if (trimmed.length > 5000) {
      setFieldError(FIELD_ERRORS.announcement_body_too_long);
      return;
    }
    setFieldError(null);
    setErrorKey(null);
    setIsSubmitting(true);
    const result = await onSave(trimmed);
    setIsSubmitting(false);
    if (result) {
      setErrorKey(result);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      {/* Hardcoded id relies on AnnouncementList's single-`editingId`
          invariant — only one edit form is ever mounted at a time. If
          multi-edit is ever added, this must become per-announcement
          (e.g. `announcement-edit-body-${announcementId}`) to avoid an id
          collision. */}
      <Label htmlFor="announcement-edit-body" className="sr-only">
        {M3_UI_STRINGS.announcements_edit_body_label}
      </Label>
      <Textarea
        id="announcement-edit-body"
        rows={3}
        value={body}
        aria-invalid={fieldError ? "true" : undefined}
        aria-describedby={
          fieldError ? "announcement-edit-body-error" : undefined
        }
        onChange={(e) => setBody(e.target.value)}
        disabled={isSubmitting}
      />
      {fieldError ? (
        <p
          id="announcement-edit-body-error"
          role="alert"
          className={cn(ERROR_LINE_CLASS, "text-sm")}
        >
          {fieldError}
        </p>
      ) : null}
      {errorKey ? (
        <p role="alert" className={cn(ERROR_LINE_CLASS, "text-sm")}>
          {ERRORS[errorKey]}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={isSubmitting}
          onClick={() => void handleSave()}
        >
          {M3_UI_STRINGS.announcements_edit_save}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isSubmitting}
          onClick={onCancel}
        >
          {M3_UI_STRINGS.announcements_edit_cancel}
        </Button>
      </div>
    </div>
  );
}
