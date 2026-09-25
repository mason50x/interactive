import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * The app's card surface: a light grey face defined by a visible border.
 *
 * One radius scale for every card in the app. The marketing pages set theirs
 * at `lg`, the dashboard tiles at `xl`, and anything that sits inside the
 * rail beside `rounded-xl` rows takes `sm` so it reads as one of them. A
 * caller that needs something else can still pass a `rounded-*` class:
 * `className` is merged rather than appended, so it actually wins.
 */
const cardVariants = cva("border", {
  variants: {
    radius: {
      sm: "rounded-xl",
      md: "rounded-2xl",
      lg: "rounded-[1.25rem]",
      xl: "rounded-[1.5rem]",
    },
    surface: {
      surface: "border-card-outline bg-card-surface",
      background: "border-border bg-background",
      /** For the inverted panel, which is dark in both themes. */
      panel: "border-panel-border bg-panel-elevated",
    },
    hover: {
      none: "",
      /** Moves a step and strengthens the border, for a card that is a link. */
      lift: "transition-[transform,border-color] duration-300 hover:-translate-y-1 hover:border-card-outline-hover",
      /** Strengthens the border without movement, for a card with controls in it. */
      glow: "transition-colors duration-300 hover:border-card-outline-hover",
    },
  },
  defaultVariants: {
    radius: "xl",
    surface: "surface",
    hover: "none",
  },
});

function Card({
  className,
  radius,
  surface,
  hover,
  ...props
}: ComponentProps<"div"> & VariantProps<typeof cardVariants>) {
  return (
    <div
      data-slot="card"
      className={cn(cardVariants({ radius, surface, hover }), className)}
      {...props}
    />
  );
}

export { Card, cardVariants };
