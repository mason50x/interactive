import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * The narrow rail's stand-in for a card.
 *
 * Below `lg`, or collapsed, the rail is 4.5rem of icons and there is no room
 * for the search box, the invite card or the version card — so each of them
 * becomes this: one square the height of a nav row, drawn as one of the
 * rail's own hover surfaces, with the inset focus ring the nav rows carry for
 * the reason given in `AppSidebar`. `rail-narrow` and `wide:hidden` are what
 * swap it out for the wide form on the timing `globals.css` describes.
 *
 * One component rather than three copies of the string, because the three sit
 * one above the other in the icon rail and a square that was a pixel off in
 * one of them would be the first thing anyone saw.
 */
export function RailButton({ className, ...props }: ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-11 w-full cursor-pointer items-center justify-center rounded-lg text-muted-foreground rail-narrow outline-none hover:bg-foreground/[0.05] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset wide:hidden",
        className,
      )}
      {...props}
    />
  );
}
