"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";

import { cn } from "@/lib/utils";

type Bar = { left: number; right: number; toward: "left" | "right" | null };

/**
 * One underline for the whole list, slid between rows rather than drawn on
 * each of them.
 *
 * Each edge is transitioned on its own. The edge on the side it is heading
 * leaves first and the trailing edge follows a beat later, so the bar
 * stretches across the gap and gathers itself back up at the far end — the
 * width changes on the way, and it lands at the new label's width.
 *
 * It measures the element marked `data-underline={href}` inside `list`,
 * so it follows whatever is visible: the icon alone, or icon and label.
 */
export function NavUnderline({
  list,
  href,
}: {
  list: RefObject<HTMLElement | null>;
  href: string | null;
}) {
  const [bar, setBar] = useState<Bar | null>(null);
  const shown = useRef<string | null>(null);

  useLayoutEffect(() => {
    const root = list.current;
    if (!root) return;

    function measure(animate: boolean) {
      const target = href
        ? root!.querySelector<HTMLElement>(
            `[data-underline="${CSS.escape(href)}"]`,
          )
        : null;
      if (!target) {
        shown.current = null;
        setBar(null);
        return;
      }
      const outer = root!.getBoundingClientRect();
      const inner = target.getBoundingClientRect();
      const left = inner.left - outer.left;
      const right = outer.right - inner.right;
      // A resize keeps whichever way the bar was already heading: the
      // observer fires once as soon as it starts watching, and resetting the
      // transition then would cancel the slide on its first frame.
      setBar((previous) => ({
        left,
        right,
        toward: !previous
          ? null
          : animate && shown.current !== null
            ? left > previous.left
              ? "right"
              : "left"
            : previous.toward,
      }));
      shown.current = href;
    }

    measure(shown.current !== href);

    // Labels arrive at `xl` and the lit row turns bold, and both change the
    // widths underneath; follow them without replaying the slide.
    const observer = new ResizeObserver(() => measure(false));
    observer.observe(root);
    for (const node of root.querySelectorAll("[data-underline]"))
      observer.observe(node);
    return () => observer.disconnect();
  }, [list, href]);

  if (!bar) return null;

  return (
    <span
      aria-hidden
      style={{ left: bar.left, right: bar.right }}
      className={cn(
        "pointer-events-none absolute bottom-1 h-0.5 rounded-full bg-primary motion-reduce:transition-none",
        bar.toward === "right" &&
          "[transition:right_220ms_cubic-bezier(0.32,0.72,0,1),left_320ms_cubic-bezier(0.32,0.72,0,1)_90ms]",
        bar.toward === "left" &&
          "[transition:left_220ms_cubic-bezier(0.32,0.72,0,1),right_320ms_cubic-bezier(0.32,0.72,0,1)_90ms]",
        bar.toward === null && "transition-none",
      )}
    />
  );
}
