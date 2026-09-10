import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * A key, as printed on a hint.
 *
 * `data-slot="kbd"` is what `TooltipContent` looks for to tighten its own
 * padding around one. The `mono` variant is for a key the reader is being
 * asked to recognise back — the recorder in the settings sheet — where the
 * glyphs want the fixed-width face so `⌘` and `K` sit at the same size.
 */
function Kbd({
  className,
  mono = false,
  ...props
}: ComponentProps<"kbd"> & { mono?: boolean }) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "inline-flex shrink-0 items-center rounded border border-border bg-background px-1.5 py-0.5 leading-none text-faint",
        mono
          ? "rounded-md bg-surface font-mono text-[0.75rem] text-foreground shadow-[0_1px_0_var(--border)]"
          : "text-[0.6875rem] font-medium",
        className,
      )}
      {...props}
    />
  );
}

export { Kbd };
