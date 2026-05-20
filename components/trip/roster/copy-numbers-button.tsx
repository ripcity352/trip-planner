"use client";

/**
 * CopyNumbersButton — copies a comma-separated string of all trip member
 * phone numbers to the clipboard.
 *
 * Uses navigator.clipboard.writeText; no new npm deps.
 * Tap target ≥ 44px per Apple HIG (min-h-11).
 */

import { useState } from "react";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";

interface CopyNumbersButtonProps {
  phones: string[];
}

export function CopyNumbersButton({ phones }: CopyNumbersButtonProps) {
  const [copied, setCopied] = useState(false);
  const disabled = phones.length === 0;

  async function handleCopy() {
    await navigator.clipboard.writeText(phones.join(", "));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={handleCopy}
      className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium min-h-11 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent hover:text-accent-foreground transition-colors"
    >
      {copied
        ? M3_UI_STRINGS.roster_copy_numbers_done
        : M3_UI_STRINGS.roster_copy_numbers_cta}
    </button>
  );
}
