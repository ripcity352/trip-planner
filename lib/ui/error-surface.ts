import type { CSSProperties } from "react";

/**
 * #209 error-surface contract — "calm surface, never a red flood."
 *
 * Errors render on `--surface-elevated` with a 1px hairline border in
 * `--accent-heat-text` at 40% alpha, body copy in `--ink-primary`. NOT
 * persimmon-filled, NOT a red flood. See notes/design-system.md
 * §"Error-surface contract (#209)".
 *
 * `--surface-error` is a *treatment, not a standalone token* (a standalone
 * token would invite the red-flood fill the contract bans), so these are the
 * canonical primitives every error surface reuses.
 *
 * Two shapes (merge extra utilities via the cn() helper):
 *   - Surface banner (role="alert"/"status" with padding + border):
 *       className={cn(ERROR_SURFACE_CLASS, "px-3 py-2 text-xs")}
 *       style={ERROR_SURFACE_BORDER_STYLE}
 *   - Inline validation/error/status line (text only, no surface):
 *       className={cn(ERROR_LINE_CLASS, "text-sm")}
 */

/**
 * 1px hairline in `--accent-heat-text` @ 40% alpha. Applied via inline style
 * because `--accent-heat-text` is not exposed as a Tailwind color utility
 * (only the shadcn-mapped tokens are); arbitrary `var()` alpha modifiers
 * don't compose cleanly in Tailwind v4.
 */
export const ERROR_SURFACE_BORDER_STYLE: CSSProperties = {
  borderColor: "color-mix(in srgb, var(--accent-heat-text) 40%, transparent)",
};

/**
 * Error banner: `--surface-elevated` background (`bg-card`) + 1px hairline +
 * body copy in `--ink-primary` (`text-card-foreground`). Pair with
 * `ERROR_SURFACE_BORDER_STYLE`.
 */
export const ERROR_SURFACE_CLASS =
  "rounded-md border bg-card text-card-foreground";

/**
 * Inline error/validation/status line — no surface, just calm ink.
 * `--ink-secondary` (`text-muted-foreground`): de-emphasized, "needs
 * attention" without yelling. Never persimmon.
 */
export const ERROR_LINE_CLASS = "text-muted-foreground";
