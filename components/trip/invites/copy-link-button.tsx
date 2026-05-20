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
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";

interface CopyLinkButtonProps {
  token: string;
}

export function CopyLinkButton({ token }: CopyLinkButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const url = `${window.location.origin}/invite/${token}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    // Reset after 3s so the button is reusable.
    setTimeout(() => setCopied(false), 3000);
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleCopy}
      className="h-11"
    >
      {copied
        ? M3_UI_STRINGS.invitesPage_copied
        : M3_UI_STRINGS.invitesPage_copy_link_cta}
    </Button>
  );
}
