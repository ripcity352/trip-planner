import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // `relative` + the bare `after:content-['']` here are the hit-slop
  // mechanism (#F4 / design-system.md "Touch-target hit-slop mechanism").
  // The pseudo-element carries no paint (no bg/border) — per-size variants
  // below size its `inset` so the EFFECTIVE hit area reaches 44px while the
  // VISUAL size (h-8/h-9/size-8) stays exactly as before. Never a visual
  // diff, so this can't move a visual baseline.
  "group/button relative inline-flex shrink-0 items-center justify-center rounded-xs border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none after:content-[''] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        // 32px visual → 44px effective. y-only: default buttons commonly
        // sit in gap-2 (8px) horizontal rows (e.g. the date-poll add/cancel
        // pair) — x-slop there would overlap the neighbor's hit box.
        default:
          "h-8 gap-1.5 px-2.5 after:absolute after:-inset-y-1.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-xs px-2 text-xs in-data-[slot=button-group]:rounded-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-xs px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        // 36px visual → 44px effective. y-only for the same adjacency reason.
        lg: "h-9 gap-1.5 px-2.5 after:absolute after:-inset-y-1 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        // 32×32 visual → 44×44 effective. No current icon-only usage sits
        // in a dense adjacent row, so both axes get slop.
        icon: "size-8 after:absolute after:-inset-1.5",
        "icon-xs":
          "size-6 rounded-xs in-data-[slot=button-group]:rounded-xs [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-xs in-data-[slot=button-group]:rounded-xs",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
