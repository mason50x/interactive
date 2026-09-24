"use client";

import {
  useCallback,
  useLayoutEffect,
  useRef,
  type FocusEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

/** One highlight follows the selected row and visits hovered or focused rows. */
export function GlideList({
  className,
  listClassName,
  children,
}: {
  className?: string;
  listClassName?: string;
  children: ReactNode;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLDivElement>(null);
  const hovering = useRef(false);

  const move = useCallback((row: Element | null) => {
    const box = frame.current;
    const indicator = pill.current;
    if (!box || !indicator) return;
    if (!row) {
      indicator.style.opacity = "0";
      return;
    }
    const from = box.getBoundingClientRect();
    const to = row.getBoundingClientRect();
    indicator.style.width = `${to.width}px`;
    indicator.style.height = `${to.height}px`;
    indicator.style.transform = `translate(${to.left - from.left}px, ${to.top - from.top}px)`;
    indicator.style.opacity = "1";
  }, []);

  const selected = useCallback(
    () =>
      frame.current?.querySelector(
        '[data-glide-row]:has([aria-current="page"])',
      ) ?? null,
    [],
  );
  useLayoutEffect(() => {
    const id = requestAnimationFrame(() => {
      move(selected());
      if (pill.current) pill.current.dataset.ready = "true";
    });
    return () => cancelAnimationFrame(id);
  });

  const rowUnder = (target: EventTarget | null) => {
    const box = frame.current;
    if (!box || !(target instanceof Element)) return null;
    const row = target.closest("[data-glide-row]");
    return row && box.contains(row) ? row : null;
  };

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch") return;
    hovering.current = true;
    move(rowUnder(event.target) ?? selected());
  }

  function onPointerLeave(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch") return;
    hovering.current = false;
    move(selected());
  }

  function onFocus(event: FocusEvent<HTMLDivElement>) {
    if (
      !hovering.current &&
      event.target instanceof Element &&
      event.target.matches(":focus-visible")
    )
      move(rowUnder(event.target));
  }

  function onBlur(event: FocusEvent<HTMLDivElement>) {
    if (!hovering.current && !rowUnder(event.relatedTarget)) move(selected());
  }

  return (
    <div
      ref={frame}
      className={cn("relative isolate", className)}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <div
        ref={pill}
        aria-hidden="true"
        className="pointer-events-none absolute -z-10 rounded-lg bg-foreground/[0.065] opacity-0 data-[ready=true]:transition-[transform,width,height,opacity] data-[ready=true]:duration-250 data-[ready=true]:ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
      />
      <ul className={listClassName}>{children}</ul>
    </div>
  );
}
