import type { ReactNode } from "react";

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
 * of it — and `interactive` only deepens it.
 *
 * `className` is merged rather than appended, so a caller that needs a
 * different radius or padding actually gets one — two competing `rounded-*`
 * classes in the same attribute are settled by stylesheet order, which is not
 * something a call site can reason about.
 */
export function Card({
  children,
  className,
  interactive = false,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[1.5rem] border border-border bg-surface shadow-card",
        interactive &&
          "transition-all duration-300 hover:-translate-y-1 hover:border-border-strong hover:shadow-card-hover",
        className,
      )}
    >
      {children}
    </div>
  );
}
