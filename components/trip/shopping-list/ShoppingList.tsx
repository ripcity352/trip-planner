"use client";

/**
 * `<ShoppingList>` — client component rendered by
 * `/trips/[tripId]/shopping-list`.
 *
 * PLACEHOLDER (Task 5) — renders a bare item-name list so the route
 * compiles. Task 6 replaces this with the real claim/bought/notes UI
 * (add form, category grouping, claim CTA, reaction bar, notes thread,
 * detail sheet — see docs/superpowers/specs/2026-08-11-shopping-list-design.md).
 */

import type { ShoppingItem, TripMember } from "@/lib/db/types";
import type { ViewerMember } from "@/lib/db/trips";

export interface ShoppingListProps {
  items: ShoppingItem[];
  tripMembers: TripMember[];
  tripId: string;
  viewer: ViewerMember;
}

export function ShoppingList({ items, tripMembers }: ShoppingListProps) {
  if (items.length === 0) {
    // Placeholder-only copy — Task 6 wires this through
    // lib/copy/empty-states.ts (rule: don't inline copy literals).
    return (
      <p className="text-muted-foreground text-sm">Nothing on the list yet.</p>
    );
  }

  const memberNameById = new Map(
    tripMembers.map((member) => [member.id, member.display_name])
  );

  return (
    <ul className="divide-border divide-y">
      {items.map((item) => (
        <li key={item.id} className="py-3">
          <span className={item.bought ? "line-through" : undefined}>
            {item.name}
          </span>
          {item.claimed_by_trip_member_id ? (
            <span className="text-muted-foreground ml-2 text-sm">
              {memberNameById.get(item.claimed_by_trip_member_id) ?? "Someone"}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
