/**
 * SkeletonCard — shared loading placeholder for route-level `loading.tsx`
 * files (issue #466: zero loading feedback app-wide).
 *
 * Renders a single hairline-bordered card matching the app's standard
 * card rhythm (`rounded-md border border-border bg-card`, see
 * `now-next-card.tsx` / `roster-list.tsx`) with 1-3 pulsing bar
 * placeholders inside. Parameterized per-page via props rather than
 * hand-rolling 8 variants — one component, different `lines`/`showAvatar`
 * per call site.
 *
 * `motion-safe:animate-pulse` honors `prefers-reduced-motion` (no global
 * guardrail exists in globals.css for `animate-pulse`, so it's applied
 * per-use here).
 *
 * No spinners, no progress bars — hard-banned per CLAUDE.md. This is a
 * content-shape placeholder, not a percentage-complete indicator.
 */

import { cn } from "@/lib/utils";
import { A11Y_UI_STRINGS } from "@/lib/copy/empty-states";

export interface SkeletonCardProps {
  /** Number of text-bar rows inside the card. */
  lines?: number;
  /** Tailwind width classes for each bar, cycling if shorter than `lines`. */
  lineWidths?: string[];
  /** Leading circular placeholder (avatar / icon slot). */
  showAvatar?: boolean;
  className?: string;
}

export function SkeletonCard({
  lines = 2,
  lineWidths = ["w-2/3", "w-1/3"],
  showAvatar = false,
  className,
}: SkeletonCardProps) {
  return (
    <div
      data-slot="skeleton-card"
      className={cn(
        "motion-safe:animate-pulse rounded-md border border-border bg-card px-4 py-3",
        className
      )}
    >
      <div className="flex items-center gap-3">
        {showAvatar ? (
          <div className="h-9 w-9 shrink-0 rounded-full bg-muted" />
        ) : null}
        <div className="flex-1 space-y-2">
          {Array.from({ length: lines }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-3 rounded-xs bg-muted",
                lineWidths[i % lineWidths.length]
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export interface SkeletonCardListProps extends SkeletonCardProps {
  /** Number of cards to render. */
  count?: number;
}

/**
 * A vertical stack of `SkeletonCard`s at the standard `gap-3` list rhythm
 * (see `expenses/page.tsx`'s `<ol className="flex flex-col gap-3">`).
 * The whole list is one `role="status"` region so screen readers announce
 * "Loading" once instead of once per placeholder card.
 */
export function SkeletonCardList({
  count = 3,
  ...cardProps
}: SkeletonCardListProps) {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} {...cardProps} />
      ))}
    </div>
  );
}

export interface SkeletonPageProps {
  /** Page-heading bar width (Tailwind width class). */
  headingWidth?: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * The shared shell every route `loading.tsx` renders: a pulsing heading
 * bar + whatever skeleton content the page passes in, wrapped in a single
 * `role="status"` region so assistive tech announces "Loading" once for
 * the whole route transition rather than per placeholder.
 */
export function SkeletonPage({
  headingWidth = "w-40",
  children,
  className,
}: SkeletonPageProps) {
  return (
    <div
      role="status"
      aria-label={A11Y_UI_STRINGS.loading}
      className={cn("py-4", className)}
    >
      <div
        className={cn(
          "motion-safe:animate-pulse mb-4 h-6 rounded-xs bg-muted",
          headingWidth
        )}
        aria-hidden="true"
      />
      {children}
    </div>
  );
}
