import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

/**
 * What a list says when there is nothing in it.
 *
 * A sentence, centred, in the muted tone, with enough room above and below
 * that the empty list does not look like a rendering error. Renders as
 * whichever element the list is made of — an `li` inside a `ul`, a `p`
 * anywhere else — so the markup stays valid.
 */
function EmptyState({
  className,
  as: Tag = "p",
  ...props
}: HTMLAttributes<HTMLElement> & { as?: "p" | "li" | "div" }) {
  return (
    <Tag
      data-slot="empty-state"
      className={cn(
        "py-6 text-center text-[0.8125rem] leading-relaxed text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { EmptyState };
