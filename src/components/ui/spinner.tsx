"use client";

import { useLayoutEffect, useRef, type ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * The moment the first spinner on the page started turning. Every spinner
 * after it starts from the same moment, so one loader handing off to the
 * next (the server's, then a gate's, then a route's) reads as the same
 * spinner carrying on rather than a new one starting from the top.
 */
let epoch: CSSNumberish | null = null;

/**
 * One round-capped line chasing itself around a circle. The svg turns at a
 * steady rate while the arc stretches and shrinks along its own path (the
 * `spinner-arc` keyframes in `globals.css`), so the line reads as fluid
 * rather than a fixed notch on a wheel.
 *
 * `role="status"` with a label is what announces the wait to a screen reader.
 * Where the spinner sits inside a control that already says it is busy, pass
 * `aria-hidden` at the call site so the state is not read out twice.
 *
 * The animations are pinned to `epoch` as soon as they exist, so the
 * spinner never shows a frame of its own phase.
 */
function Spinner({ className, ...props }: ComponentProps<"svg">) {
  const ref = useRef<SVGSVGElement>(null);
  useLayoutEffect(() => {
    const animations = ref.current?.getAnimations({ subtree: true }) ?? [];
    epoch ??=
      animations.find((animation) => animation.startTime !== null)?.startTime ??
      document.timeline.currentTime;
    for (const animation of animations) animation.startTime = epoch;
  }, []);
  return (
    <svg
      ref={ref}
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

/** The whole window held on the spinner, for a wait before the app itself
 *  can show. Every gate on the way in uses this same screen, so passing from
 *  one to the next changes nothing on it. */
function ScreenSpinner({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="screen-spinner"
      className={cn("fixed inset-0 bg-background", className)}
      {...props}
    >
      <CenteredSpinner />
    </div>
  );
}

export { Spinner, PageSpinner, CenteredSpinner, ScreenSpinner };
