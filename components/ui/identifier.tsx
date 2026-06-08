"use client";

/**
 * Identifier — Layer-2 design-system primitive for displaying opaque
 * identifier values (tokens, UUIDs, confirmation codes, etc.) in monospace
 * with an optional copy-on-tap affordance.
 *
 * CONTRACT (architect-signed, issue #215):
 *   - Renders `value` verbatim in font-mono with truncation. NO hashing,
 *     NO short-hash, NO transform of any kind.
 *   - If `label` is provided, renders it as a small label alongside.
 *   - If `copyable`, clicking copies the raw `value` to the clipboard via
 *     the canonical clipboard pattern from copy-link-button.tsx:
 *       navigator.clipboard.writeText inside try/catch, console.error on
 *       failure with ERRORS.network fallback, aria-live="polite" status.
 *
 * SECURITY: value is rendered as React text children only — never via
 * dangerouslySetInnerHTML, never coerced into an href. Any adversarial
 * string (javascript:, file://, RTL override, template literal, etc.)
 * is inert text in the DOM.
 *
 * Strings sourced from M3_UI_STRINGS / ERRORS per Override F — no inline
 * JSX string literals.
 */

import { useState } from "react";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS } from "@/lib/copy/errors";
import { cn } from "@/lib/utils";

interface IdentifierProps {
  /** The raw value to display verbatim. Rendered as text — never executed. */
  value: string;
  /** Optional caller-supplied label rendered above the value. */
  label?: string;
  /** When true, a click/tap copies the raw value to the clipboard. */
  copyable?: boolean;
  /** Additional className forwarded to the outer wrapper. */
  className?: string;
}

export function Identifier({
  value,
  label,
  copyable = false,
  className,
}: IdentifierProps) {
  const [copied, setCopied] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleCopy() {
    setErrorMessage(null);
    try {
      // Copy the raw value verbatim — no transform, no hashing.
      await navigator.clipboard.writeText(value);
      setCopied(true);
      // Reset after 3s so the affordance is reusable.
      setTimeout(() => setCopied(false), 3000);
    } catch (err) {
      // clipboard.writeText rejects on insecure context, permission denied,
      // and iOS Safari edge cases. Surface a fallback string and log.
      console.error("[identifier] copy failed:", err);
      setErrorMessage(ERRORS.network);
    }
  }

  return (
    <div className={cn("inline-flex flex-col gap-0.5", className)}>
      {label !== undefined ? (
        <span className="text-xs text-muted-foreground">{label}</span>
      ) : null}

      <div className="flex items-center gap-1.5">
        {/* Value rendered as React text children — inert, never HTML-injected */}
        <span className="font-mono text-xs truncate max-w-[200px]">
          {value}
        </span>

        {copyable ? (
          <button
            type="button"
            onClick={handleCopy}
            aria-describedby={
              copied
                ? "identifier-copy-status"
                : errorMessage
                  ? "identifier-copy-error"
                  : undefined
            }
            className="shrink-0 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
          >
            {copied
              ? M3_UI_STRINGS.identifier_copied
              : M3_UI_STRINGS.identifier_copy}
          </button>
        ) : null}
      </div>

      {copied && !errorMessage ? (
        <span
          id="identifier-copy-status"
          role="status"
          aria-live="polite"
          className="sr-only"
        >
          {M3_UI_STRINGS.identifier_copied}
        </span>
      ) : null}

      {errorMessage ? (
        <span
          id="identifier-copy-error"
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
