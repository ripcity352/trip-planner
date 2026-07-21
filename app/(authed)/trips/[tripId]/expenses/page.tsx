/**
 * /trips/[tripId]/expenses — expenses MVP (#372).
 *
 * Server Component. `getExpensesByTrip` is already visibility-filtered
 * by RLS (`can_see_content`) — a celebrant never receives a
 * hide_from_celebrant expense here. Splits are join-fetched trip-wide
 * and paired per expense in app code; splits whose parent expense was
 * filtered out never render because pairing starts from the expense
 * list (see lib/db/expenses.ts docs).
 *
 * NOTE: `tripId` in the URL is the trip SLUG (whole-subtree convention).
 */

import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getTripBySlug, getViewerMember, getTripMembers } from "@/lib/db/trips";
import { getExpensesByTrip, getSplitsByTrip } from "@/lib/db/expenses";
import { resolveMemberName } from "@/lib/utils/member-display";
import { formatCents } from "@/lib/utils/format-cents";
import { isOrganizerRole } from "@/lib/utils/expense-visibility";
import { EMPTY_STATES, M5_UI_STRINGS } from "@/lib/copy/empty-states";
import { ExpenseCard } from "@/components/trip/expenses/expense-card";
import { AddExpenseSheet } from "@/components/trip/expenses/add-expense-sheet";
import { EditExpenseSheet } from "@/components/trip/expenses/edit-expense-sheet";

type PageProps = {
  params: Promise<{ tripId: string }>;
};

export default async function ExpensesPage({ params }: PageProps) {
  const { tripId: slug } = await params;
  const supabase = await createClient();

  const trip = await getTripBySlug(supabase, slug);
  if (!trip) {
    notFound();
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    notFound();
  }

  const viewer = await getViewerMember(supabase, trip.id, user.id);
  if (!viewer) {
    notFound();
  }

  const [expenses, splits, tripMembers] = await Promise.all([
    getExpensesByTrip(supabase, trip.id),
    getSplitsByTrip(supabase, trip.id),
    getTripMembers(supabase, trip.id),
  ]);

  const memberMap: ReadonlyMap<string, { display_name: string | null }> =
    new Map(tripMembers.map((m) => [m.id, { display_name: m.display_name }]));
  const memberIdByUserId = new Map(
    tripMembers.flatMap((m) => (m.user_id ? [[m.user_id, m.id] as const] : []))
  );

  const splitsByExpense = new Map<string, typeof splits>();
  for (const split of splits) {
    const bucket = splitsByExpense.get(split.expense_id) ?? [];
    splitsByExpense.set(split.expense_id, [...bucket, split]);
  }

  // Header math: trip total (visible spends) + the viewer's share of them.
  const totalCents = expenses.reduce((sum, e) => sum + e.amount_cents, 0);
  const myShareCents = expenses.reduce((sum, e) => {
    const mine = (splitsByExpense.get(e.id) ?? []).find(
      (s) => s.trip_member_id === viewer.id
    );
    return sum + (mine?.amount_cents ?? 0);
  }, 0);
  // Currency for the headline: MVP trips are single-currency (USD
  // default); first expense's currency wins for the aggregate line.
  const headlineCurrency = expenses[0]?.currency ?? "USD";

  // #391: rsvp_status rides along so the split chooser can pre-select
  // going/maybe only and annotate the rest — the data was already here.
  const splitCandidates = tripMembers.map((m) => ({
    memberId: m.id,
    name: resolveMemberName(memberMap, m.id),
    rsvpStatus: m.rsvp_status,
  }));

  // #405-B: celebrant display name for the hide-from-celebrant badge —
  // derived from the already-fetched members (no extra query).
  const celebrantName =
    tripMembers.find((m) => m.is_celebrant)?.display_name ?? null;

  // Viewer seat for the composer sheets (#384): visibility options are
  // filtered to what this member could still read.
  const viewerContext = {
    isOrganizer: isOrganizerRole(viewer.role),
    isCelebrant: viewer.is_celebrant,
  };

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          {M5_UI_STRINGS.expenses_heading}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">{trip.name}</p>
        {expenses.length > 0 ? (
          <p className="text-muted-foreground mt-2 text-sm">
            {M5_UI_STRINGS.expenses_total_label}
            {": "}
            <span className="tabular-nums">
              {formatCents(totalCents, headlineCurrency)}
            </span>
            {myShareCents > 0 ? (
              <>
                {" · "}
                {M5_UI_STRINGS.expenses_your_share_label}
                {": "}
                <span className="tabular-nums">
                  {formatCents(myShareCents, headlineCurrency)}
                </span>
              </>
            ) : null}
          </p>
        ) : null}
      </header>

      {expenses.length === 0 ? (
        <p className="text-muted-foreground text-sm">{EMPTY_STATES.expenses}</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {expenses.map((expense) => {
            const payerMemberId = memberIdByUserId.get(expense.payer_id);
            const expenseSplits = splitsByExpense.get(expense.id) ?? [];
            // Mirrors the #383 RLS scope: payer or (co-)organizer.
            const canEdit =
              expense.payer_id === user.id || viewerContext.isOrganizer;
            return (
              <li key={expense.id}>
                <ExpenseCard
                  expense={expense}
                  splits={expenseSplits}
                  payerName={
                    payerMemberId
                      ? resolveMemberName(memberMap, payerMemberId)
                      : resolveMemberName(memberMap, "")
                  }
                  viewerMemberId={viewer.id}
                  celebrantName={celebrantName}
                  memberMap={memberMap}
                />
                {canEdit ? (
                  <EditExpenseSheet
                    tripId={trip.id}
                    expense={expense}
                    members={splitCandidates}
                    initialSplitMemberIds={expenseSplits.map(
                      (s) => s.trip_member_id
                    )}
                    viewer={viewerContext}
                    className="mt-2"
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      )}

      <div className="mt-8">
        <AddExpenseSheet
          tripId={trip.id}
          members={splitCandidates}
          viewer={viewerContext}
        />
      </div>
    </section>
  );
}
