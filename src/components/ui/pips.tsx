import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * A count out of a small total, as a row of pips.
 *
 * For an allowance — invitations left, changes left — where the whole is
 * small enough to draw and the number alone would not say how much of it is
 * gone. The filled ones are what is left, and they drain right to left, the
 * way a bar that fills left to right empties: the run of colour starts at
 * the same edge the row starts at and shortens towards it.
 *
 * `aria-hidden`, because the number beside it is the accessible version.
 */
function Pips({
  remaining,
  limit,
  className,
  ...props
}: ComponentProps<"div"> & { remaining: number; limit: number }) {
  return (
    <div
      data-slot="pips"
      aria-hidden
      className={cn("flex gap-1", className)}
      {...props}
    >
      {Array.from({ length: limit }, (_, index) => (
        <span
          key={index}
          className={cn(
            "h-1.5 flex-1 rounded-full transition-colors duration-300",
            index < remaining ? "bg-primary" : "bg-border-strong",
          )}
        />
      ))}
    </div>
  );
}

export { Pips };
