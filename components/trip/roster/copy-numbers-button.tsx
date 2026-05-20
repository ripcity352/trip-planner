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
import { ERRORS } from "@/lib/copy/errors";

interface CopyNumbersButtonProps {
  phones: string[];
}

export function CopyNumbersButton({ phones }: CopyNumbersButtonProps) {
  const [copied, setCopied] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const disabled = phones.length === 0;

  async function handleCopy() {
    setErrorMessage(null);
    try {
      await navigator.clipboard.writeText(phones.join(", "));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      // clipboard.writeText rejects on insecure context, permission denied,
      // and some iOS Safari edge cases. Surface a warm fallback string and
      // log for diagnosis.
      console.error("[roster] copy-numbers failed:", err);
      setErrorMessage(ERRORS.network);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={disabled}
        onClick={handleCopy}
        aria-describedby={
          copied ? "copy-numbers-status" : errorMessage ? "copy-numbers-error" : undefined
        }
        className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium min-h-11 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent hover:text-accent-foreground transition-colors"
      >
        {copied
          ? M3_UI_STRINGS.roster_copy_numbers_done
          : M3_UI_STRINGS.roster_copy_numbers_cta}
      </button>
      {copied && !errorMessage ? (
        <span
          id="copy-numbers-status"
          role="status"
          aria-live="polite"
          className="sr-only"
        >
          {M3_UI_STRINGS.roster_copy_numbers_done}
        </span>
      ) : null}
      {errorMessage ? (
        <span
          id="copy-numbers-error"
          role="status"
          aria-live="polite"
          className="text-destructive text-xs"
        >
          {errorMessage}
        </span>
      ) : null}
    </div>
  );
}
