import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * A hairline between two things.
 *
 * Horizontal unless told otherwise, and `aria-hidden` because a rule is
 * decoration: the grouping it draws is one a screen reader gets from the
 * headings. With children it becomes a heading with the rule running out of
 * both sides — for a label that is cutting a panel into parts rather than
 * naming a column, where a line across the whole width is what says "a
 * different thing starts here".
 */
function Separator({
  className,
  orientation = "horizontal",
  children,
  ...props
}: ComponentProps<"div"> & { orientation?: "horizontal" | "vertical" }) {
  if (children) {
    return (
      <div
        data-slot="separator"
        className={cn("flex items-center gap-2.5", className)}
        {...props}
      >
        <span aria-hidden className="h-px flex-1 bg-border" />
        <p className="text-xs font-semibold text-muted-foreground">
          {children}
        </p>
        <span aria-hidden className="h-px flex-1 bg-border" />
      </div>
    );
  }

  return (
    <div
      data-slot="separator"
      aria-hidden
      className={cn(
        "shrink-0 bg-border",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
      {...props}
    />
  );
}

export { Separator };
