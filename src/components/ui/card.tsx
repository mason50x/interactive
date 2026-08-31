import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The app's card surface: a lighter face than the chrome around it, held off
 * it by a hairline and nothing else.
 *
 * `className` is merged rather than appended, so a caller that needs a
 * different radius or padding actually gets one — two competing `rounded-*`
 * classes in the same attribute are settled by stylesheet order, which is not
 * something a call site can reason about.
 */
export function Card({
  children,
  className,
  interactive = false,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[1.5rem] border border-border bg-surface",
        interactive &&
          "transition-all duration-300 hover:-translate-y-1 hover:border-border-strong hover:shadow-[0_18px_40px_-24px_rgba(15,15,15,0.35)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
