import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * shadcn's spinner, drawn inline rather than pulled from `lucide-react`: the
 * geometry below is Lucide's `loader`, and this is the only icon the project
 * would have wanted from that package — everything else is Heroicons.
 *
 * The spokes are stepped rather than swept. A ring of separate notches turned
 * continuously reads as a smear; landing it on each spoke in turn is what
 * makes the eye see the notches at all, so the timing function is overridden
 * to eight discrete ticks while `animate-spin` keeps the rest.
 *
 * `role="status"` with a label is what announces the wait to a screen reader.
 * Where the spinner sits inside a control that already says it is busy, pass
 * `aria-hidden` at the call site so the state is not read out twice.
 */
function Spinner({ className, ...props }: ComponentProps<"svg">) {
  return (
    <svg
      data-slot="spinner"
      role="status"
      aria-label="Loading"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(
        "size-4 animate-spin [animation-timing-function:steps(8)]",
        className,
      )}
      {...props}
    >
      <line x1="12" x2="12" y1="2" y2="6" />
      <line x1="12" x2="12" y1="18" y2="22" />
      <line x1="4.93" x2="7.76" y1="4.93" y2="7.76" />
      <line x1="16.24" x2="19.07" y1="16.24" y2="19.07" />
      <line x1="2" x2="6" y1="12" y2="12" />
      <line x1="18" x2="22" y1="12" y2="12" />
      <line x1="4.93" x2="7.76" y1="19.07" y2="16.24" />
      <line x1="16.24" x2="19.07" y1="7.76" y2="4.93" />
    </svg>
  );
}

export { Spinner };
