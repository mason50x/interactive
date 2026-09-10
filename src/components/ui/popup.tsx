import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * What a floating surface looks like, in the one place every menu, popover
 * and hint reads it from.
 *
 * A menu on a message, a popover on a name, the search's results, the
 * account menu: they are the same object seen in different places, and the
 * only thing keeping them the same used to be a class string typed out in
 * nine files. The surface is one radius, one hairline, one shadow. What
 * varies is the padding — a row of emoji wants less than a form — and the
 * entrance: `slide` for something anchored to a trigger, `drop` for a
 * popover that hangs below one. Both are in `globals.css`, because the
 * `@starting-style` transition they need cannot be written as a utility.
 *
 * Not a Base UI part: `Menu.Popup`, `Popover.Popup` and `Tooltip.Popup`
 * already are the components, and take these classes by name. `Popup` is
 * the same surface for the places that are a plain `div`.
 */
const popupVariants = cva(
  "rounded-xl border border-border bg-popover text-popover-foreground shadow-lg shadow-black/[0.08] outline-none",
  {
    variants: {
      motion: {
        none: "",
        slide: "popup-slide",
        drop: "popup-drop",
      },
      padding: {
        none: "",
        xs: "p-1",
        sm: "p-1.5",
        md: "p-2.5",
        lg: "p-3",
      },
    },
    defaultVariants: {
      motion: "slide",
      padding: "sm",
    },
  },
);

function Popup({
  className,
  motion,
  padding,
  ...props
}: ComponentProps<"div"> & VariantProps<typeof popupVariants>) {
  return (
    <div
      data-slot="popup"
      className={cn(popupVariants({ motion, padding }), className)}
      {...props}
    />
  );
}

export { Popup, popupVariants };
