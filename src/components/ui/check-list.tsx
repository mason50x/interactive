import { CheckIcon } from "@heroicons/react/24/solid";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A list of things that are true, each with a tick.
 *
 * The marketing pages' bullet: what a plan includes, what a cohort gets. The
 * tick is drawn in a disc so it reads as a mark and not as a stray glyph,
 * and the disc takes the accent for the surface it sits on — brand on the
 * page, the accent on the inverted panel.
 */
function CheckList({
  className,
  tone = "default",
  items,
  ...props
}: Omit<ComponentProps<"ul">, "children"> & {
  tone?: "default" | "inverted";
  items: readonly ReactNode[];
}) {
  return (
    <ul
      data-slot="check-list"
      className={cn("flex flex-col gap-3", className)}
      {...props}
    >
      {items.map((item, index) => (
        <li
          key={index}
          className={cn(
            "flex items-start gap-3 text-[0.9375rem]",
            tone === "inverted"
              ? "text-panel-foreground/85"
              : "text-foreground/85",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "mt-1 flex size-4 shrink-0 items-center justify-center rounded-full",
              tone === "inverted"
                ? "bg-primary text-primary-foreground"
                : "bg-accent text-accent-foreground",
            )}
          >
            <CheckIcon className="size-3" />
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export { CheckList };
