"use client";

/**
 * ActivityTagField — thin wrapper around ActivityTagPicker.
 *
 * Preserves the value/onChange/disabled API expected by parent forms.
 * The parent form (edit-item-form.tsx, add-item-form.tsx) stores
 * activity_tag as text[], which this field emits directly as string[].
 */

import { ActivityTagPicker } from "./activity-tag-picker";

export interface ActivityTagFieldProps {
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}

export function ActivityTagField({
  value,
  onChange,
  disabled = false,
}: ActivityTagFieldProps) {
  return (
    <ActivityTagPicker value={value} onChange={onChange} disabled={disabled} />
  );
}
