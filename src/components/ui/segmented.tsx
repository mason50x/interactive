"use client";

import {
  useLayoutEffect,
  useRef,
  type ComponentProps,
  type ReactNode,
} from "react";

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
  tone = "primary",
  className,
  ...props
}: Omit<ComponentProps<"div">, "onChange"> & {
  value: Value;
  onValueChange: (value: Value) => void;
  options: readonly { value: Value; label: ReactNode; icon?: ReactNode }[];
  tone?: "primary" | "neutral";
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const indicator = indicatorRef.current;
    if (!container || !indicator) return;

    const update = () => {
      const selected = container.querySelector<HTMLButtonElement>(
        'button[aria-pressed="true"]',
      );
      indicator.style.visibility = selected ? "visible" : "hidden";
      if (!selected) return;
      indicator.style.width = `${selected.offsetWidth}px`;
      indicator.style.height = `${selected.offsetHeight}px`;
      indicator.style.transform = `translate(${selected.offsetLeft}px, ${selected.offsetTop}px)`;
    };

    update();
    const frame = requestAnimationFrame(() => {
      indicator.dataset.ready = "true";
    });
    const observer = new ResizeObserver(update);
    observer.observe(container);
    container
      .querySelectorAll("button")
      .forEach((button) => observer.observe(button));
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [value, options]);

  return (
    <div
      ref={containerRef}
      role="group"
      data-slot="segmented-control"
      className={cn(
        "relative isolate flex h-10 shrink-0 items-center gap-0.5 rounded-lg border border-border bg-foreground/[0.03] p-1",
        className,
      )}
      {...props}
    >
      <span
        ref={indicatorRef}
        aria-hidden="true"
        className={cn(
          "pointer-events-none invisible absolute top-0 left-0 rounded-md shadow-sm data-[ready=true]:transition-[transform,width] data-[ready=true]:duration-300 data-[ready=true]:ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
          tone === "neutral" ? "bg-surface" : "bg-primary",
        )}
      />
      {options.map((option) => {
        const pressed = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={pressed}
            onClick={() => onValueChange(option.value)}
            className={cn(
              "relative z-10 flex h-full cursor-pointer items-center gap-1.5 rounded-md px-3 text-[0.8125rem] font-medium transition-colors duration-200 outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none",
              pressed
                ? tone === "neutral"
                  ? "text-foreground"
                  : "text-primary-foreground"
                : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground",
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
