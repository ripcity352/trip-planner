"use client";

/**
 * MemberManage (#386) — the organizer-only per-row roster affordance.
 *
 * Quiet overflow (⋯) → inline panel with two moves:
 *   - role flip: "Make co-organizer" / "Back to crew"
 *   - "Remove from trip" — #210 two-step destructive (first tap arms the
 *     persimmon confirm naming the object + consequence, second commits)
 *
 * Rule 11: this is a micro-affordance, not an admin panel. Eligibility
 * (never on your own row, the celebrant, or the founder) is decided by
 * the PARENT — this component assumes it was rendered for a manageable
 * row; the server action re-checks every guard regardless.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { callAction } from "@/lib/ui/call-action";
import {
  removeMemberAction,
  setMemberRoleAction,
  type SettableMemberRole,
} from "@/lib/actions/members";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import { M5_UI_STRINGS } from "@/lib/copy/empty-states";

export interface MemberManageProps {
  tripId: string;
  memberId: string;
  /** Resolved display name — used in the aria-label and confirm copy. */
  memberName: string;
  currentRole: SettableMemberRole;
  className?: string;
}

export function MemberManage({
  tripId,
  memberId,
  memberName,
  currentRole,
  className,
}: MemberManageProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [removeArmed, setRemoveArmed] = React.useState(false);
  const [errorKey, setErrorKey] = React.useState<ErrorKey | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const nextRole: SettableMemberRole =
    currentRole === "co_organizer" ? "attendee" : "co_organizer";
  const roleLabel =
    currentRole === "co_organizer"
      ? M5_UI_STRINGS.roster_manage_back_to_crew
      : M5_UI_STRINGS.roster_manage_make_co;

  const close = () => {
    setOpen(false);
    setRemoveArmed(false);
    setErrorKey(null);
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
    // #210 two-step: first tap arms, second commits.
    if (!removeArmed) {
      setRemoveArmed(true);
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

        {/* #210 two-step destructive: armed state escalates the
            persimmon outline — never a solid destructive flood. */}
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

      {errorKey ? (
        <p role="alert" className={cn(ERROR_LINE_CLASS, "text-xs")}>
          {ERRORS[errorKey] ?? ERRORS.network}
        </p>
      ) : null}
    </div>
  );
}
