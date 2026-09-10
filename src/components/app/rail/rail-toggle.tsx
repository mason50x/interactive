"use client";

import { RailIconSolid } from "@/components/app/nav-icons";
import { useRail } from "@/components/app/rail-context";
import type { RailState } from "@/lib/rail";
import { cn } from "@/lib/utils";

/**
 * One half of the collapse control: the button in the header that closes the
 * rail, or the row in the icon rail that opens it. Which is `to`; the caller
 * shapes it. Both are drawn as one of the rail's own hover surfaces, and take
 * the inset focus ring the nav rows do for the reason given there.
 *
 * No `transition-colors`: both halves carry `rail-wide` or `rail-narrow` (or
 * sit inside one), and those own the transition list. See `globals.css`.
 */
export function RailToggle({
  to,
  label,
  className,
}: {
  to: RailState;
  label: string;
  className?: string;
}) {
  const { setRail } = useRail();

  return (
    <button
      type="button"
      onClick={() => setRail(to)}
      aria-label={label}
      title={label}
      data-to={to}
      className={cn(
        "rail-toggle flex cursor-pointer items-center justify-center text-muted-foreground backdrop-blur-[3px] outline-none hover:bg-foreground/[0.05] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset",
        className,
      )}
    >
      <RailIconSolid className="size-5" />
    </button>
  );
}
