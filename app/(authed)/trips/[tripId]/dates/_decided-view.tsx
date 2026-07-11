/**
 * Decided state of `/dates` (#369). Once an organizer locks a window,
 * `trips.starts_at`/`ends_at` are set and the poll is archived — every
 * role sees the answer, not a live vote. Server Component: no realtime,
 * no candidate fetch, no interactivity.
 *
 * Reconcile: this closes the gap where the trip header showed a locked
 * range while `/dates` still ran a live poll ("Vote on the windows still
 * in play"). `isDatePollDecided` is the single source of truth the page
 * branches on.
 *
 * The bespoke celebrant/organizer asymmetry lives in the poll phase
 * (marks vs votes, the lock affordance). The decided window is one warm
 * shared line for everyone — nobody needs a role-specific "it's locked".
 */

import { M2_UI_STRINGS } from "@/lib/copy/empty-states";

import { formatDateRange } from "./_format";

interface DecidedViewProps {
  startsAt: string;
  endsAt: string;
}

export function DecidedView({ startsAt, endsAt }: DecidedViewProps) {
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          {M2_UI_STRINGS.datePoll_decided_heading}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {M2_UI_STRINGS.datePoll_decided_subhead}
        </p>
      </header>
      <p className="text-xl font-medium tracking-tight">
        {formatDateRange(startsAt, endsAt)}
      </p>
    </section>
  );
}
