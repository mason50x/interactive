"use client";

import { type ReactNode, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Label on the left, control on the right, and — when there is one — a line of
 * consequence under both.
 *
 * Every control in the settings panel now fits on the label's line, which is
 * what lets the whole page be one shape instead of two. The control column may
 * shrink (`min-w-0`, so a dropdown narrows rather than pushing its label off
 * the edge on a phone-width modal); the label may not. No horizontal padding
 * of its own: Clerk's page supplies the gutter, and a second one inside it
 * would put these rows a step in from the Account page's.
 */
export function Row({
  label,
  note,
  children,
}: {
  label: string;
  note?: string | null | false;
  children: ReactNode;
}) {
  return (
    <div className="py-3.5">
      <div className="flex items-center justify-between gap-4">
        <p className="shrink-0 text-[0.875rem] font-medium text-foreground">
          {label}
        </p>
        <div className="flex min-w-0 justify-end">{children}</div>
      </div>
      <RowNote>{note || null}</RowNote>
    </div>
  );
}

/**
 * The line under a row, which grows and collapses rather than appearing.
 *
 * A note that pops in shoves the rest of the panel down a line in a single
 * frame, and in a page where every other change is a transition that is the
 * one movement that reads as a glitch. The measurement problem — you cannot
 * transition to `height: auto` — is solved with a collapsed grid row:
 * `0fr` to `1fr` is two numbers CSS will interpolate, and the child clips
 * itself against the track.
 *
 * The text is held through the collapse. Clearing it on the same frame the
 * row starts closing would animate an empty box shut, so the last thing said
 * stays said until the space it occupied is gone.
 */
function RowNote({ children }: { children: string | null }) {
  const [held, setHeld] = useState(children);
  if (children !== null && children !== held) setHeld(children);

  return (
    <div
      aria-hidden={children === null}
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
        children === null ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr]",
      )}
    >
      <div className="overflow-hidden">
        <p className="pt-2 text-[0.75rem] leading-relaxed text-muted-foreground">
          {children ?? held}
        </p>
      </div>
    </div>
  );
}
