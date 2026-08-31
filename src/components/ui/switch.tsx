"use client";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";

import { cn } from "@/lib/utils";

/**
 * A two-state control that commits on click, with no Save behind it.
 *
 * The track is `--primary` when on, so it carries the account's accent like
 * every other filled control. The thumb moves with `translate` rather than by
 * changing its offsets: one property, on the compositor, instead of a layout
 * pass per frame.
 *
 * The geometry is exact: a 20x36 track with 2px of padding leaves a 16x32 well,
 * so the 16px thumb sits flush top and bottom and travels its own width to the
 * far side. Any border here would eat into that well and cost the thumb its
 * gutter on the checked end.
 */
function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full bg-border-strong p-0.5 transition-colors duration-200 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-checked:bg-primary",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="block size-4 rounded-full bg-white shadow-[0_1px_2px_rgba(15,15,15,0.25)] transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] data-checked:translate-x-4"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
