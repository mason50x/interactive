import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * A word in a pill.
 *
 * `solid` is the brand-coloured one: "New", "Most popular", the tag on a
 * plan. `outline` is a chip on the page's own surface, and `soft` a tint for
 * a status that should be read but not noticed. Two sizes, because a badge in
 * running text is smaller than one on a card.
 */
const badgeVariants = cva(
  "inline-flex shrink-0 items-center gap-1 rounded-full font-medium whitespace-nowrap",
  {
    variants: {
      variant: {
        solid: "bg-primary text-primary-foreground",
        outline: "border border-border bg-surface text-muted-foreground",
        soft: "bg-foreground/[0.06] text-foreground",
      },
      size: {
        sm: "px-2 py-0.5 text-[0.75rem]",
        md: "px-3 py-1 text-[0.75rem]",
      },
    },
    defaultVariants: { variant: "solid", size: "sm" },
  },
);

function Badge({
  className,
  variant,
  size,
  ...props
}: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  );
}

/**
 * A number in a dot: unread messages, invitations left.
 *
 * Tabular figures, so a count that ticks from 9 to 10 widens by a digit and
 * not by a wobble. `min-w` equal to the height keeps a single digit round.
 */
function CountBadge({
  className,
  size = "sm",
  ...props
}: ComponentProps<"span"> & { size?: "sm" | "md" }) {
  return (
    <span
      data-slot="count-badge"
      className={cn(
        "flex items-center justify-center rounded-full bg-primary leading-none font-semibold text-primary-foreground tabular-nums",
        size === "sm"
          ? "h-4 min-w-4 px-1 text-[0.625rem]"
          : "h-5 min-w-5 px-1.5 text-[0.6875rem]",
        className,
      )}
      {...props}
    />
  );
}

export { Badge, CountBadge, badgeVariants };
