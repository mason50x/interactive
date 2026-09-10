"use client";

import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A choice of a few, all of them showing, one of them pressed.
 *
 * The control for a mode — grid or list, HTML or Game Boy — where a select
 * would hide the options and a row of buttons would not say they exclude
 * each other. The group is a `role="group"` with a label, and each option a
 * button carrying `aria-pressed`, which is the pattern a screen reader
 * announces as a toggle rather than a tab.
 *
 * `value`/`onValueChange` so the caller holds the state, as with a select.
 */
function SegmentedControl<Value extends string>({
  value,
  onValueChange,
  options,
  className,
  ...props
}: Omit<ComponentProps<"div">, "onChange"> & {
  value: Value;
  onValueChange: (value: Value) => void;
  options: readonly { value: Value; label: ReactNode; icon?: ReactNode }[];
}) {
  return (
    <div
      role="group"
      data-slot="segmented-control"
      className={cn(
        "flex h-10 shrink-0 items-center gap-0.5 rounded-lg border border-border bg-foreground/[0.03] p-1",
        className,
      )}
      {...props}
    >
      {options.map((option) => {
        const pressed = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={pressed}
            onClick={() => onValueChange(option.value)}
            className={cn(
              "flex h-full cursor-pointer items-center gap-1.5 rounded-md px-3 text-[0.8125rem] font-medium transition-colors outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50",
              pressed
                ? "bg-background text-foreground shadow-[0_1px_2px_rgba(15,15,15,0.12)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.icon ? (
              <span aria-hidden className="flex [&_svg]:size-4">
                {option.icon}
              </span>
            ) : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export { SegmentedControl };
