"use client";

/**
 * CopyLinkButton — builds the full invite URL from the token and copies
 * it to the clipboard via navigator.clipboard.writeText. Shows a
 * confirmation string after a successful copy.
 *
 * Voice test: "would you say this at a pre-trip dinner?"
 * Strings sourced from M3_UI_STRINGS per Override F.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS } from "@/lib/copy/errors";

interface CopyLinkButtonProps {
  token: string;
}

export function CopyLinkButton({ token }: CopyLinkButtonProps) {
  const [copied, setCopied] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleCopy() {
    setErrorMessage(null);
    const url = `${window.location.origin}/invite/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      // Reset after 3s so the button is reusable.
      setTimeout(() => setCopied(false), 3000);
    } catch (err) {
      // clipboard.writeText rejects on insecure context, permission denied,
      // and iOS Safari edge cases. Surface a fallback string and log.
      console.error("[invites] copy-link failed:", err);
      setErrorMessage(ERRORS.network);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleCopy}
        aria-describedby={
          copied ? "copy-link-status" : errorMessage ? "copy-link-error" : undefined
        }
        className="h-11"
      >
        {copied
          ? M3_UI_STRINGS.invitesPage_copied
          : M3_UI_STRINGS.invitesPage_copy_link_cta}
      </Button>
      {copied && !errorMessage ? (
        <span
          id="copy-link-status"
          role="status"
          aria-live="polite"
          className="sr-only"
        >
          {M3_UI_STRINGS.invitesPage_copied}
        </span>
      ) : null}
      {errorMessage ? (
        <span
          id="copy-link-error"
          role="status"
          aria-live="polite"
          className={cn(ERROR_LINE_CLASS, "text-xs")}
        >
          {errorMessage}
        </span>
      ) : null}
    </div>
  );
}
