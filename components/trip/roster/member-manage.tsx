"use client";

/**
 * MemberManage (#386) — the organizer-only per-row roster affordance.
 *
 * Quiet overflow (⋯) → inline panel with two moves:
 *   - role flip: "Make co-organizer" / "Back to crew"
 *   - "Remove from trip" — #210 two-step destructive (first tap arms the
 *     persimmon confirm naming the object + consequence, second commits)
 *
 * Celebrant assignment (FOUNDER viewers only — parent gates via the
 * `celebrant` prop): a third move on ordinary rows ("This trip's for
 * them"; two-step only when it unseats a current holder), and on the
 * current celebrant's own row the panel becomes a single clear
 * affordance ("Back into the crew", always two-step).
 *
 * Rule 11: this is a micro-affordance, not an admin panel. Eligibility
 * (never on your own row or the founder; the celebrant row only in the
 * founder's clear-mode) is decided by the PARENT — this component
 * assumes it was rendered for a manageable row; the server action
 * re-checks every guard regardless.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { callAction } from "@/lib/ui/call-action";
import {
  removeMemberAction,
  setCelebrantAction,
  setMemberRoleAction,
  type SettableMemberRole,
} from "@/lib/actions/members";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import { M5_UI_STRINGS } from "@/lib/copy/empty-states";

/**
 * Celebrant capability — threaded only for FOUNDER viewers (rule 11:
 * non-founders never see the affordance, no disabled states).
 */
export interface CelebrantManage {
  /** True when THIS row is the trip's current celebrant (clear-mode). */
  isCelebrant: boolean;
  /**
   * Resolved name of the trip's current celebrant on ANOTHER row, or
   * null when the seat is empty (or this row holds it). Non-null makes
   * the assign move a #210 two-step, since it unseats them.
   */
  currentCelebrantName: string | null;
}

export interface MemberManageProps {
  tripId: string;
  memberId: string;
  /** Resolved display name — used in the aria-label and confirm copy. */
  memberName: string;
  currentRole: SettableMemberRole;
  celebrant?: CelebrantManage;
  className?: string;
}

export function MemberManage({
  tripId,
  memberId,
  memberName,
  currentRole,
  celebrant,
  className,
}: MemberManageProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [removeArmed, setRemoveArmed] = React.useState(false);
  const [celebrantArmed, setCelebrantArmed] = React.useState(false);
  const [errorKey, setErrorKey] = React.useState<ErrorKey | null>(null);
  const [isPending, startTransition] = React.useTransition();

  // Clear-mode: this row IS the celebrant — the only move is unseating.
  const celebrantClearMode = celebrant?.isCelebrant === true;

  const nextRole: SettableMemberRole =
    currentRole === "co_organizer" ? "attendee" : "co_organizer";
  const roleLabel =
    currentRole === "co_organizer"
      ? M5_UI_STRINGS.roster_manage_back_to_crew
      : M5_UI_STRINGS.roster_manage_make_co;

  const close = () => {
    setOpen(false);
    setRemoveArmed(false);
    setCelebrantArmed(false);
    setErrorKey(null);
  };

  const commitCelebrant = (targetMemberId: string | null) => {
    startTransition(async () => {
      setErrorKey(null);
      const result = await callAction(() =>
        setCelebrantAction(
          { tripId, memberId: targetMemberId },
          crypto.randomUUID()
        )
      );
      if (!result.ok) {
        setErrorKey(result.errorKey);
        setCelebrantArmed(false);
        return;
      }
      close();
      router.refresh();
    });
  };

  const handleMakeCelebrant = () => {
    // #210 two-step ONLY when someone currently holds the seat — a
    // first-ever assignment commits in one tap.
    if (celebrant?.currentCelebrantName != null && !celebrantArmed) {
      setCelebrantArmed(true);
      setRemoveArmed(false);
      return;
    }
    commitCelebrant(memberId);
  };

  const handleClearCelebrant = () => {
    // Always two-step: it unseats the current guest of honor.
    if (!celebrantArmed) {
      setCelebrantArmed(true);
      return;
    }
    commitCelebrant(null);
  };

  const handleRoleFlip = () => {
    startTransition(async () => {
      setErrorKey(null);
      // #431: rejected awaits resolve to the network envelope via callAction.
      const result = await callAction(() =>
        setMemberRoleAction({ tripId, memberId, role: nextRole }, crypto.randomUUID())
      );
      if (!result.ok) {
        setErrorKey(result.errorKey);
        return;
      }
      close();
      router.refresh();
    });
  };

  const handleRemove = () => {
    // #210 two-step: first tap arms, second commits. Arming remove
    // disarms a pending celebrant confirm — one armed move at a time.
    if (!removeArmed) {
      setRemoveArmed(true);
      setCelebrantArmed(false);
      return;
    }
    startTransition(async () => {
      setErrorKey(null);
      const result = await callAction(() =>
        removeMemberAction({ tripId, memberId }, crypto.randomUUID())
      );
      if (!result.ok) {
        setErrorKey(result.errorKey);
        setRemoveArmed(false);
        return;
      }
      close();
      router.refresh();
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={M5_UI_STRINGS.roster_manage_aria_template.replace(
          "{name}",
          memberName
        )}
        className={cn(
          "focus-visible:ring-ring rounded-xs p-1.5 text-muted-foreground",
          "hover:bg-muted focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
          className
        )}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden={true} />
      </button>
    );
  }

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-2 rounded-xs border border-border bg-card p-3",
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {!celebrantClearMode ? (
          <button
            type="button"
            onClick={handleRoleFlip}
            disabled={isPending}
            className={cn(
              "focus-visible:ring-ring rounded-xs border border-border bg-muted px-3 py-1.5 text-xs font-medium",
              "hover:bg-muted/80 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
              "disabled:cursor-not-allowed disabled:opacity-60"
            )}
          >
            {roleLabel}
          </button>
        ) : null}

        {/* Founder-only celebrant moves (parent threads `celebrant`).
            On the celebrant's own row the panel is JUST the clear
            affordance; elsewhere it's a third quiet move. */}
        {celebrant ? (
          <button
            type="button"
            onClick={
              celebrantClearMode ? handleClearCelebrant : handleMakeCelebrant
            }
            disabled={isPending}
            className={cn(
              "focus-visible:ring-ring rounded-xs border border-border bg-muted px-3 py-1.5 text-xs font-medium",
              "hover:bg-muted/80 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
              "disabled:cursor-not-allowed disabled:opacity-60",
              celebrantArmed && "border-foreground/40 bg-muted/80"
            )}
          >
            {celebrantClearMode
              ? M5_UI_STRINGS.roster_manage_clear_celebrant
              : M5_UI_STRINGS.roster_manage_make_celebrant}
          </button>
        ) : null}

        {/* #210 two-step destructive: armed state escalates the
            persimmon outline — never a solid destructive flood. */}
        {!celebrantClearMode ? (
          <button
            type="button"
            onClick={handleRemove}
            disabled={isPending}
            className={cn(
              "focus-visible:ring-ring rounded-xs border px-3 py-1.5 text-xs font-medium",
              "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
              "disabled:cursor-not-allowed disabled:opacity-60",
              removeArmed
                ? "border-destructive bg-destructive/10 text-destructive"
                : "border-destructive/40 text-destructive hover:bg-destructive/10"
            )}
          >
            {M5_UI_STRINGS.roster_manage_remove}
          </button>
        ) : null}

        <button
          type="button"
          onClick={close}
          disabled={isPending}
          className={cn(
            "focus-visible:ring-ring rounded-xs px-3 py-1.5 text-xs font-medium text-muted-foreground",
            "hover:bg-muted focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-60"
          )}
        >
          {M5_UI_STRINGS.roster_manage_close}
        </button>
      </div>

      {removeArmed ? (
        <p className="text-destructive text-xs font-medium">
          {M5_UI_STRINGS.roster_manage_remove_confirm_template.replace(
            "{name}",
            memberName
          )}
        </p>
      ) : null}

      {/* Celebrant confirm — names both seats changing hands. Not a
          destructive move, so it stays in ink, not persimmon. */}
      {celebrantArmed ? (
        <p className="text-xs font-medium">
          {celebrantClearMode
            ? M5_UI_STRINGS.roster_manage_celebrant_clear_confirm_template.replace(
                "{name}",
                memberName
              )
            : M5_UI_STRINGS.roster_manage_celebrant_reassign_confirm_template
                .replace("{name}", memberName)
                .replace(
                  "{current}",
                  celebrant?.currentCelebrantName ?? ""
                )}
        </p>
      ) : null}

      {errorKey ? (
        <p role="alert" className={cn(ERROR_LINE_CLASS, "text-xs")}>
          {ERRORS[errorKey] ?? ERRORS.network}
        </p>
      ) : null}
    </div>
  );
}
