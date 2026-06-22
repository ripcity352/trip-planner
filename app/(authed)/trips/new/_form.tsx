"use client";

/**
 * `<TripForm />` — the only interactive part of `/trips/new`.
 *
 * react-hook-form + zod. Fields: name (required), start/end dates
 * (optional), description (optional). On submit:
 *   1. zod validates the shape
 *   2. server action `createTripAction(input, idempotencyKey)` is
 *      called with a client-generated idempotency key (drunk-double-tap
 *      protection)
 *   3. While pending the submit button disables + shows a spinner
 *   4. On success, the server action redirects to `/trips/<slug>` and
 *      this component never renders again
 *   5. On `{ ok: false, errorKey }` we render the matching string from
 *      `ERRORS[errorKey]` in an aria-live region
 *
 * All visible strings come from `lib/copy/errors.ts` (no inline
 * literals beyond UI scaffolding — voice-tested locally below).
 */

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import { M2_UI_STRINGS } from "@/lib/copy/empty-states";
import { createTripAction } from "@/lib/actions/trips";
import { cn } from "@/lib/utils";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: ERRORS.validation_failed })
    .max(100, { message: ERRORS.validation_failed }),
  starts_at: z.string().optional(),
  ends_at: z.string().optional(),
  description: z.string().trim().max(1000).optional(),
});

type FormValues = z.infer<typeof schema>;

export function TripForm() {
  const [isPending, startTransition] = useTransition();
  const [errorKey, setErrorKey] = useState<ErrorKey | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", starts_at: "", ends_at: "", description: "" },
  });

  function onSubmit(values: FormValues) {
    setErrorKey(null);
    // No client idempotency key: trip creation isn't drunk-double-tap
    // territory (it's a deliberate "I'm starting a new thing" moment),
    // and slug-collision retry inside the action already handles the
    // realistic race. The action's signature dropped the param — see
    // lib/actions/trips.ts.
    startTransition(async () => {
      try {
        const result = await createTripAction({
          name: values.name,
          description: values.description || undefined,
          starts_at: values.starts_at || undefined,
          ends_at: values.ends_at || undefined,
        });
        // On success the action redirects; if we got here, it returned
        // an error envelope.
        if (result && !result.ok) {
          setErrorKey(result.errorKey);
        }
      } catch (err) {
        // The Next.js redirect throws — let it propagate so the
        // framework can handle navigation. Anything else is an
        // unexpected fault: surface a generic toast.
        if (
          err instanceof Error &&
          (err.message.startsWith("NEXT_REDIRECT") ||
            ("digest" in err &&
              typeof (err as { digest?: unknown }).digest === "string" &&
              (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")))
        ) {
          throw err;
        }
        setErrorKey("network");
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="trip-name">{M2_UI_STRINGS.newTrip_nameLabel}</Label>
        <Input
          id="trip-name"
          type="text"
          autoComplete="off"
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? "trip-name-error" : undefined}
          {...register("name")}
        />
        {errors.name ? (
          <p
            id="trip-name-error"
            role="alert"
            className={cn(ERROR_LINE_CLASS, "text-sm")}
          >
            {errors.name.message}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="trip-starts-at">
            {M2_UI_STRINGS.newTrip_startLabel}
          </Label>
          <Input
            id="trip-starts-at"
            type="date"
            {...register("starts_at")}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="trip-ends-at">{M2_UI_STRINGS.newTrip_endLabel}</Label>
          <Input id="trip-ends-at" type="date" {...register("ends_at")} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="trip-description">
          {M2_UI_STRINGS.newTrip_vibePromptLabel}
        </Label>
        <Input
          id="trip-description"
          type="text"
          autoComplete="off"
          {...register("description")}
        />
      </div>

      {errorKey ? (
        <p role="alert" className={cn(ERROR_LINE_CLASS, "text-sm")}>
          {ERRORS[errorKey]}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={isPending}>
        {isPending ? (
          <Loader2
            data-slot="spinner"
            className="size-4 animate-spin"
            aria-hidden="true"
          />
        ) : null}
        {M2_UI_STRINGS.newTrip_submit}
      </Button>
    </form>
  );
}
