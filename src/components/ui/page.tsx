import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * A dashboard page: the measure, the gutters, and the space above and below.
 *
 * Every page inside the shell opens the same way — a title at display size,
 * then the page — and the wrapper is what keeps the left edge of one page on
 * the left edge of the next as you move between them.
 */
function Page({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="page"
      className={cn(
        "mx-auto flex w-full max-w-[1400px] flex-col gap-8 px-6 pt-8 pb-16 sm:px-8 lg:px-10",
        className,
      )}
      {...props}
    />
  );
}

/**
 * The page's name, set in the display face at page-title weight.
 *
 * `text-display-title` is the half-step down from the display weight; see
 * `globals.css` for why the two headings that carry the title size want it.
 */
function PageTitle({ className, ...props }: ComponentProps<"h1">) {
  return (
    <h1
      data-slot="page-title"
      className={cn(
        "text-display text-display-title text-[2.25rem] text-balance text-foreground sm:text-[2.75rem]",
        className,
      )}
      {...props}
    />
  );
}

/** The sentence under the title, in the muted tone. */
function PageDescription({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      data-slot="page-description"
      className={cn(
        "max-w-xl text-[1.0625rem] leading-relaxed text-pretty text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { Page, PageDescription, PageTitle };
