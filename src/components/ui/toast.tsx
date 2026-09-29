"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A sentence that shows up, stays long enough to be read, and leaves.
 *
 * For the one-off note that is worth saying and not worth a box that has to
 * be closed: something happened, here is what, carry on. `role="status"` is
 * what has a screen reader say it without interrupting what the reader was
 * doing, which is the right weight for a note and the wrong one for an error
 * — an error is `Alert`.
 *
 * The parent owns whether it is showing; this owns how long. `onDone` fires
 * after `duration` milliseconds so the parent can clear it, and the timer
 * restarts whenever `children` change, so a second note that arrives during
 * the first gets its own full stay.
 */
export function Toast({
  children,
  onDone,
  duration = 7000,
  className,
}: {
  children: ReactNode;
  onDone: () => void;
  duration?: number;
  className?: string;
}) {
  useEffect(() => {
    const timer = setTimeout(onDone, duration);
    return () => clearTimeout(timer);
  }, [children, duration, onDone]);

  return (
    <p
      role="status"
      className={cn(
        "animate-notice-in max-w-full rounded-full border border-border bg-surface px-3.5 py-1.5 text-center text-[0.8125rem] text-muted-foreground shadow-[0_2px_8px_rgba(15,15,15,0.06)]",
        className,
      )}
    >
      {children}
    </p>
  );
}
