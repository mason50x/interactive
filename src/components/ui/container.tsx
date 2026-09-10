import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * The page's measure: centred, gutters that widen with the viewport, and one
 * of four maximum widths. `wide` is the dashboard's, `default` the marketing
 * site's; `narrow` and `prose` are for a column of text.
 */
const widths = {
  default: "max-w-[1200px]",
  wide: "max-w-[1400px]",
  narrow: "max-w-4xl",
  prose: "max-w-2xl",
} as const;

export type ContainerWidth = keyof typeof widths;

function Container({
  className,
  width = "default",
  ...props
}: ComponentProps<"div"> & { width?: ContainerWidth }) {
  return (
    <div
      data-slot="container"
      className={cn(
        "mx-auto w-full px-5 sm:px-8 lg:px-10",
        widths[width],
        className,
      )}
      {...props}
    />
  );
}

export { Container };
