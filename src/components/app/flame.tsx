"use client";

import { useId } from "react";
import { SolidIcon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

/**
 * The streak fire.
 *
 * Drawn here rather than imported from Heroicons, which has a `FireIcon` and
 * would have been one line. Two things it cannot do: it is a single path with
 * the core knocked *out* of the body, so there is no inner shape to give its
 * own colour or its own beat — and being one path, a gradient across it is one
 * gradient, where a fire is two temperatures stacked. The silhouette below is
 * Heroicons' own, so the flame still belongs to the same icon set as the rest
 * of the app; what is new is that the core is a shape sitting in front of the
 * body instead of a hole cut through it.
 *
 * Both halves take a vertical gradient running the way heat does — pale gold
 * at the foot, deep orange at the tip — and both move, on periods chosen not
 * to divide into one another so the loop never lands on the same frame twice
 * in a row. The keyframes are in `globals.css`, with the reasoning for why
 * none of this uses a filter.
 *
 * The gradient ids come from `useId`, because two flames on one page — the
 * chip in the rail and the big one in the celebration over it — would
 * otherwise both resolve `url(#flame-body)` to whichever was mounted first.
 */
export function Flame({
  className,
  lit = true,
  animated = true,
}: {
  className?: string;
  /**
   * A lapsed streak keeps the shape and loses the fire: the same flame in the
   * page's own ink, so the chip does not change size or position on the day
   * someone breaks their run.
   */
  lit?: boolean;
  /** Off for the static copy behind a celebration's rings. */
  animated?: boolean;
}) {
  const id = useId();
  const body = `${id}-body`;
  const core = `${id}-core`;

  return (
    // The shell's `fill="currentColor"` is what the unlit paths inherit; the
    // lit ones override it with their gradients below.
    <SolidIcon
      className={cn("overflow-visible", className)}
      // Only the lit flame throws light. The shadow is on the <svg> rather
      // than the paths so it follows the silhouette as one shape instead of
      // the core casting a second glow onto the body in front of it.
      style={
        lit
          ? {
              filter:
                "drop-shadow(0 0 0.25em color-mix(in srgb, var(--fire) 45%, transparent))",
            }
          : undefined
      }
    >
      <defs>
        {/* y1 at the bottom, y2 at the top: the coolest colour is the one at
            the tip, which is the opposite of how a gradient is usually read
            and the reason these are written out rather than reversed later. */}
        <linearGradient id={body} x1="0" y1="1" x2="0.15" y2="0">
          <stop offset="0%" stopColor="#ffd166" />
          <stop offset="34%" stopColor="#ff9f1c" />
          <stop offset="72%" stopColor="#ff5a1f" />
          <stop offset="100%" stopColor="#e02f00" />
        </linearGradient>
        <linearGradient id={core} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#fffdf2" />
          <stop offset="45%" stopColor="#ffe066" />
          <stop offset="100%" stopColor="#ffa62b" />
        </linearGradient>
      </defs>

      <path
        d="M12.963 2.286a.75.75 0 0 0-1.071-.136 9.742 9.742 0 0 0-3.539 6.176A7.547 7.547 0 0 1 6.648 6.61a.75.75 0 0 0-1.152-.082A9 9 0 1 0 15.68 4.534a7.46 7.46 0 0 1-2.717-2.248Z"
        fill={lit ? `url(#${body})` : "currentColor"}
        fillOpacity={lit ? 1 : 0.32}
        className={cn(lit && animated && "flame-body")}
      />
      <path
        d="M15.75 14.25a3.75 3.75 0 1 1-7.313-1.172c.628.465 1.35.81 2.133 1a5.99 5.99 0 0 1 1.925-3.546 3.75 3.75 0 0 1 3.255 3.718Z"
        fill={lit ? `url(#${core})` : "currentColor"}
        fillOpacity={lit ? 1 : 0.16}
        className={cn(lit && animated && "flame-core")}
      />
    </SolidIcon>
  );
}
