"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";

import { cn } from "@/lib/utils";

type Box = { top: number; left: number; width: number; height: number };

/**
 * One raised card for the whole list, slid up and down between rows rather
 * than painted on each of them.
 *
 * It measures the element marked `data-pill={href}` inside `list`, so it has
 * to be positioned against a box that starts where `list` does, and it must
 * render after `list` so the ref is attached by the time it measures. It
 * sits at `-z-10`, so that box needs `isolate` to keep it behind the rows
 * and above whatever is under the rail.
 *
 * Only its vertical position is transitioned: moving to another row glides,
 * while the rail widening at `wide` changes its width and left edge at once,
 * so the card never trails the row it belongs to. Its first placement has
 * nothing to glide from and just appears.
 */
export function NavPill({
  list,
  href,
}: {
  list: RefObject<HTMLElement | null>;
  href: string | null;
}) {
  const [box, setBox] = useState<Box | null>(null);
  const [glide, setGlide] = useState(false);
  const placed = useRef(false);

  useLayoutEffect(() => {
    const root = list.current;
    if (!root) return;

    function measure() {
      const target = href
        ? root!.querySelector<HTMLElement>(`[data-pill="${CSS.escape(href)}"]`)
        : null;
      if (!target) {
        placed.current = false;
        setBox(null);
        setGlide(false);
        return;
      }
      const outer = root!.getBoundingClientRect();
      const inner = target.getBoundingClientRect();
      const next = {
        top: inner.top - outer.top,
        left: inner.left - outer.left,
        width: inner.width,
        height: inner.height,
      };
      // Once it has a place to glide from, it always glides. Arriving from
      // nowhere it just appears.
      setGlide(placed.current);
      placed.current = true;
      setBox((previous) =>
        previous &&
        previous.top === next.top &&
        previous.left === next.left &&
        previous.width === next.width &&
        previous.height === next.height
          ? previous
          : next,
      );
    }

    measure();

    // A page change reflows the rail too — a button tucking away, a label
    // turning bold — and the observer fires for it mid-glide. Re-measuring
    // to the same box is a no-op, so that does not cut the glide short.
    const observer = new ResizeObserver(() => measure());
    observer.observe(root);
    for (const node of root.querySelectorAll("[data-pill]"))
      observer.observe(node);
    return () => observer.disconnect();
  }, [list, href]);

  if (!box) return null;

  return (
    <span
      aria-hidden
      style={{
        transform: `translateY(${box.top}px)`,
        left: box.left,
        width: box.width,
        height: box.height,
      }}
      className={cn(
        "pointer-events-none absolute top-0 -z-10 rounded-lg bg-card shadow-[0_1px_2px_rgb(15_15_15/0.06),0_2px_8px_rgb(15_15_15/0.06)] dark:shadow-[inset_0_1px_0_0_rgb(255_255_255/0.045),0_1px_2px_rgb(0_0_0/0.5),0_2px_8px_rgb(0_0_0/0.35)]",
        glide
          ? "transition-transform duration-[380ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
          : "transition-none",
      )}
    />
  );
}
