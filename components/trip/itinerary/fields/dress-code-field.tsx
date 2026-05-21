"use client";

/**
 * DressCodeField — form-field wrapper around DressCodePicker.
 *
 * Adapts DressCodePicker to the react-hook-form watch+setValue bridge pattern
 * used throughout edit-item-form.tsx. Preserves:
 *   - Same `value` / `onChange` prop shape consumed by the parent form.
 *   - Same field label and a11y attributes (htmlFor links label to freeform input).
 *   - Same disabled state passthrough.
 *
 * W0d pre-split target: this file was extracted from edit-item-form.tsx so
 * the dress-code UI can evolve independently. The parent form passes
 * react-hook-form `watch("dressCode")` as `value` and `field.onChange`
 * (or `setValue("dressCode", ...)`) as `onChange`.
 */

import * as React from "react";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { DressCodePicker } from "./dress-code-picker";

export interface DressCodeFieldProps {
  value?: string;
  onChange: (value: string | undefined) => void;
  disabled?: boolean;
}

export function DressCodeField({
  value,
  onChange,
  disabled = false,
}: DressCodeFieldProps) {
  const inputId = "field-dress-code";
  const labelClass = "block text-sm font-medium text-foreground mb-1";

  return (
    <div>
      <label htmlFor={inputId} className={labelClass}>
        {M3_UI_STRINGS.itineraryForm_dress_label}
      </label>
      <DressCodePicker
        id={inputId}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
    </div>
  );
}
