import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * shadcn's spinner, drawn inline rather than pulled from `lucide-react`: the
 * geometry below is Lucide's `loader`, and this is the only icon the project
 * would have wanted from that package — everything else is Heroicons.
 *
 * The spokes are stepped rather than swept, eight discrete ticks to the turn,
 * one per spoke. That only reads as motion because the spokes fade as they
 * trail the leading one: eight identical notches turned by exactly their own
 * spacing land on themselves every tick, and the eye gets a flash instead of a
 * spin. The ramp is what the rotation carries around the ring, so the spokes
 * are ordered clockwise from twelve and the opacities descend with them.
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
      <line x1="12" x2="12" y1="2" y2="6" opacity="1" />
      <line x1="16.24" x2="19.07" y1="7.76" y2="4.93" opacity="0.8" />
      <line x1="18" x2="22" y1="12" y2="12" opacity="0.65" />
      <line x1="16.24" x2="19.07" y1="16.24" y2="19.07" opacity="0.5" />
      <line x1="12" x2="12" y1="18" y2="22" opacity="0.4" />
      <line x1="4.93" x2="7.76" y1="19.07" y2="16.24" opacity="0.3" />
      <line x1="2" x2="6" y1="12" y2="12" opacity="0.22" />
      <line x1="4.93" x2="7.76" y1="4.93" y2="7.76" opacity="0.15" />
    </svg>
  );
}

/** The spinner filling whatever it is put in, for a pane that is still
 *  loading. `min-h-48` so an empty pane holds its shape rather than
 *  collapsing to the spinner's own height. */
function CenteredSpinner({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="centered-spinner"
      className={cn(
        "flex h-full min-h-48 w-full items-center justify-center",
        className,
      )}
      {...props}
    >
      <Spinner className="size-5 text-muted-foreground" />
    </div>
  );
}

export { Spinner, CenteredSpinner };
