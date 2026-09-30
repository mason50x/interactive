import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * One round-capped line chasing itself around a circle. The svg turns at a
 * steady rate while the arc stretches and shrinks along its own path (the
 * `spinner-arc` keyframes in `globals.css`), so the line reads as fluid
 * rather than a fixed notch on a wheel.
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
      strokeWidth={2.5}
      strokeLinecap="round"
      className={cn("spinner size-5", className)}
      {...props}
    >
      <circle cx="12" cy="12" r="9" pathLength={100} />
    </svg>
  );
}

/** The spinner at the one size every full-pane wait uses — the gates, the
 *  route loaders, and the activity cover — so handing off from one to the
 *  next never changes its size. A finer stroke than the default so the line
 *  does not turn heavy at this scale. */
function PageSpinner({ className, ...props }: ComponentProps<"svg">) {
  return (
    <Spinner
      strokeWidth={1.5}
      className={cn("size-20 text-muted-foreground", className)}
      {...props}
    />
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
      <PageSpinner />
    </div>
  );
}

export { Spinner, PageSpinner, CenteredSpinner };
