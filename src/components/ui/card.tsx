import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * The app's card surface: a lighter face than the chrome around it, held off
 * it by a hairline and a shadow.
 *
 * The shadow is `--elevation-card` in `globals.css` and not a Tailwind
 * `shadow-*` step, because the stock steps are one blur each and one blur
 * reads as a glow. See the token for what the three layers are each doing and
 * why the dark theme needs a fourth. Every card gets it at rest — the whole
 * point is that a card is an object on the page rather than a fenced-off area
 * of it — and `hover` only deepens it.
 *
 * One radius scale for every card in the app. The marketing pages set theirs
 * at `lg`, the dashboard tiles at `xl`, and anything that sits inside the
 * rail beside `rounded-xl` rows takes `sm` so it reads as one of them. A
 * caller that needs something else can still pass a `rounded-*` class:
 * `className` is merged rather than appended, so it actually wins.
 */
const cardVariants = cva("border shadow-card", {
  variants: {
    radius: {
      sm: "rounded-xl",
      md: "rounded-2xl",
      lg: "rounded-[1.25rem]",
      xl: "rounded-[1.5rem]",
    },
    surface: {
      surface: "border-border bg-surface",
      background: "border-border bg-background",
      /** For the inverted panel, which is dark in both themes. */
      panel: "border-panel-border bg-panel-elevated",
    },
    hover: {
      none: "",
      /** Rises a step and deepens its shadow, for a card that is a link. */
      lift: "transition-all duration-300 hover:-translate-y-1 hover:border-border-strong hover:shadow-card-hover",
      /** The same deepening without the movement, for a card with controls in it. */
      glow: "transition-[border-color,box-shadow] duration-300 hover:border-border-strong hover:shadow-card-hover",
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
