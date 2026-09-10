import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const widths = {
  default: "max-w-[1200px]",
  wide: "max-w-[1400px]",
  narrow: "max-w-4xl",
  prose: "max-w-2xl",
} as const;

export function Container({
  children,
  width = "default",
  className = "",
}: {
  children: ReactNode;
  width?: keyof typeof widths;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-5 sm:px-8 lg:px-10",
        widths[width],
        className,
      )}
    >
      {children}
    </div>
  );
}
