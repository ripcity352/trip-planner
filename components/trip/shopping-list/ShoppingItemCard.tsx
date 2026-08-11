"use client";

/**
 * ShoppingItemCard — one row on the shopping list.
 *
 * Renders the item name, an optional category chip, an optional cost tag
 * (gap-C — `formatCents` + the `costTag_template`, never `formatCost`), a
 * claim affordance, a got-it toggle, and a delete affordance visible only
 * to the item's author or an organizer/co-organizer (absent otherwise —
 * never a gate message).
 *
 * gap-E: `bought` and `claimed_by` are independent columns. Marking an
 * item got-it preserves the claim; under the "Got it" divider
 * (`claimReadOnly`) the claim line renders read-only — no unclaim control.
 *
 * Every mutating control routes through `callAction` + `router.refresh()`
 * (no optimistic state — accepted MVP lag, spec §7). A single local
 * `errorKey` surfaces the last failure in a `role="alert"` region.
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { callAction } from "@/lib/ui/call-action";
import { SHOPPING_LIST_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import { formatCents } from "@/lib/utils/format-cents";
import { resolveMemberName } from "@/lib/utils/member-display";
import {
  deleteShoppingItem,
  setClaim,
  toggleBought,
} from "@/lib/actions/shopping-list";
import type { ShoppingItem, TripMember } from "@/lib/db/types";

export interface ShoppingItemCardProps {
  item: ShoppingItem;
  memberMap: ReadonlyMap<string, TripMember>;
  /** Viewer's own trip_member id — never the raw user id. */
  viewerMemberId: string;
  /** Author (via created_by_trip_member_id) or organizer/co_organizer. */
  canDelete: boolean;
  /** True under the "Got it" divider — claim renders read-only there. */
  claimReadOnly: boolean;
}

export function ShoppingItemCard({
  item,
  memberMap,
  viewerMemberId,
  canDelete,
  claimReadOnly,
}: ShoppingItemCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [errorKey, setErrorKey] = React.useState<ErrorKey | null>(null);

  const costTag =
    item.cost_cents != null
      ? SHOPPING_LIST_UI_STRINGS.costTag_template.replace(
          "{amount}",
          formatCents(item.cost_cents, item.currency)
        )
      : null;

  const claimerId = item.claimed_by_trip_member_id;
  const isClaimedByViewer = claimerId === viewerMemberId;

  const runMutation = (action: () => Promise<{ ok: true } | { ok: false; errorKey: ErrorKey }>) => {
    setErrorKey(null);
    startTransition(async () => {
      const result = await callAction(action);
      if (!result.ok) {
        setErrorKey(result.errorKey);
        return;
      }
      router.refresh();
    });
  };

  const handleToggleBought = () => runMutation(() => toggleBought(item.id, !item.bought));
  const handleClaim = () => runMutation(() => setClaim(item.id, true));
  const handleUnclaim = () => runMutation(() => setClaim(item.id, false));
  const handleDelete = () => {
    if (!window.confirm(SHOPPING_LIST_UI_STRINGS.deleteConfirm)) return;
    runMutation(() => deleteShoppingItem(item.id));
  };

  return (
    <li className="border-border flex flex-col gap-1.5 border-b py-3 last:border-b-0">
      <div className="flex items-start gap-2.5">
        <input
          type="checkbox"
          checked={item.bought}
          disabled={isPending}
          onChange={handleToggleBought}
          aria-label={SHOPPING_LIST_UI_STRINGS.gotIt}
          className="mt-0.5 h-4 w-4 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span
              className={cn(
                "text-sm",
                item.bought && "text-muted-foreground line-through"
              )}
            >
              {item.name}
            </span>
            {item.category ? (
              <span className="text-muted-foreground rounded-full border border-border px-2 py-0.5 text-xs">
                {item.category}
              </span>
            ) : null}
            {costTag ? (
              <span className="text-muted-foreground text-xs">{costTag}</span>
            ) : null}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            {claimerId ? (
              <>
                <span className="text-muted-foreground">
                  {isClaimedByViewer
                    ? SHOPPING_LIST_UI_STRINGS.claimedByYou
                    : SHOPPING_LIST_UI_STRINGS.claimedBy_template.replace(
                        "{name}",
                        resolveMemberName(memberMap, claimerId)
                      )}
                </span>
                {!claimReadOnly && isClaimedByViewer ? (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={handleUnclaim}
                    className="text-muted-foreground underline underline-offset-2 disabled:opacity-60"
                  >
                    {SHOPPING_LIST_UI_STRINGS.unclaim}
                  </button>
                ) : null}
              </>
            ) : !claimReadOnly ? (
              <button
                type="button"
                disabled={isPending}
                onClick={handleClaim}
                className="text-foreground underline underline-offset-2 disabled:opacity-60"
              >
                {SHOPPING_LIST_UI_STRINGS.claimCta}
              </button>
            ) : null}

            {canDelete ? (
              <button
                type="button"
                disabled={isPending}
                onClick={handleDelete}
                className="text-muted-foreground ml-auto underline underline-offset-2 disabled:opacity-60"
              >
                {SHOPPING_LIST_UI_STRINGS.deleteCta}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {errorKey ? (
        <p role="alert" className={cn(ERROR_LINE_CLASS, "text-xs")}>
          {ERRORS[errorKey]}
        </p>
      ) : null}
    </li>
  );
}
