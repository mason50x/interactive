"use client";

import {
  useCallback,
  useRef,
  type FocusEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { useStillness } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * A list whose hover is one thing that moves, not a row each that lights up.
 *
 * The usual `hover:bg-*` on every row is honest and abrupt: run the pointer
 * down a column of forty people and forty rectangles blink on and off behind
 * it, none of them related to the last. What is drawn here instead is a single
 * pill, laid under the rows, that slides from the row it was on to the row the
 * pointer is over now. Rows do not react to hover at all; the pill does.
 *
 * ## The morph
 *
 * The pill is positioned by its `top` and its `bottom` rather than by a top and
 * a height, because a rectangle sliding between two rows reads as *liquid* when
 * its two edges do not arrive together. The edge that faces the destination
 * leaves first and gets there quick; the edge behind it follows on a slower,
 * softer curve. On the way the pill is stretched across the gap and then
 * catches up with itself. Both edges are animated by the browser, off the
 * main thread, and the target is written to the inline style *before* the
 * animation starts, so a finished animation has nothing to hold on to — see
 * `glide`.
 *
 * Yes, `top` and `bottom` are layout properties and the FLIP hook next door
 * (`use-flip.ts`) goes to some trouble to avoid animating them. That was 318
 * cards; this is one absolutely positioned box with nothing inside it, and
 * relayout of it costs the same as a transform would.
 *
 * ## Interruptions
 *
 * A pointer does not wait for the last glide to land, so every move starts
 * from where the pill visibly *is* — the computed value under the running
 * animation — and not from where it was told to go. Fast sweeps redirect in
 * the air rather than jumping.
 *
 * ## Appearing and leaving
 *
 * The pill fades and grows in on the first row the pointer lands on and fades
 * out when it leaves the list, so it never travels *from* nowhere or *to*
 * nowhere. Those two are a CSS transition rather than a Web Animation, which
 * is what lets the reduced-motion rule at the foot of `globals.css` collapse
 * them without being told. The glide itself is JavaScript, which that rule
 * cannot reach, so it asks `useStillness` and snaps instead.
 *
 * Keyboard focus drives the same pill, so tabbing down the list looks like
 * hovering it. Touch does not: a finger has no hover, and a pill that stayed
 * lit under the last thing tapped would just be a stuck row.
 *
 * Rows opt in with `data-glide-row`; a list can have an empty-state line or a
 * label among its items, and those are simply not somewhere the pill goes.
 */
export function GlideList({
  className,
  listClassName,
  children,
}: {
  className?: string;
  listClassName?: string;
  children: ReactNode;
}) {
  const still = useStillness();
  const frame = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const pill = useRef<HTMLDivElement>(null);
  const on = useRef<Element | null>(null);
  const hovering = useRef(false);

  const hide = useCallback(() => {
    const el = pill.current;
    if (el === null) return;
    on.current = null;
    el.style.opacity = "0";
    el.style.transform = "scale(0.96)";
  }, []);

  const glide = useCallback(
    (row: Element) => {
      const el = pill.current;
      const box = frame.current;
      if (el === null || box === null || row === on.current) return;

      const from = box.getBoundingClientRect();
      const to = row.getBoundingClientRect();
      const top = to.top - from.top;
      const bottom = from.bottom - to.bottom;

      const shown = on.current !== null;
      on.current = row;

      // Where the pill visibly is right now, animation and all. Read before
      // anything is cancelled, because cancelling snaps it to the target.
      const now = getComputedStyle(el);
      const wasTop = now.top;
      const wasBottom = now.bottom;
      for (const running of el.getAnimations()) running.cancel();

      el.style.top = `${top}px`;
      el.style.bottom = `${bottom}px`;
      el.style.left = `${to.left - from.left}px`;
      el.style.width = `${to.width}px`;
      el.style.opacity = "1";
      el.style.transform = "scale(1)";

      // The first row is landed on, not travelled to.
      if (!shown || still) return;

      const down = parseFloat(wasTop) < top;
      const [lead, trail] = down
        ? (["bottom", "top"] as const)
        : (["top", "bottom"] as const);
      const was = { top: wasTop, bottom: wasBottom };
      const is = { top: `${top}px`, bottom: `${bottom}px` };

      el.animate([{ [lead]: was[lead] }, { [lead]: is[lead] }], {
        duration: 240,
        easing: "cubic-bezier(0.2, 0.9, 0.25, 1)",
      });
      el.animate([{ [trail]: was[trail] }, { [trail]: is[trail] }], {
        duration: 400,
        easing: "cubic-bezier(0.35, 0.15, 0.15, 1)",
      });
    },
    [still],
  );

  const rowUnder = (target: EventTarget | null) => {
    const box = frame.current;
    if (box === null || !(target instanceof Element)) return null;
    const row = target.closest("[data-glide-row]");
    return row !== null && box.contains(row) ? row : null;
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") return;
    hovering.current = true;
    const row = rowUnder(event.target);
    if (row !== null) glide(row);
    // The gap between two rows is on the way from one to the other, and a
    // pill that blinked out for the two pixels between them would undo the
    // whole point. Only something that is *not a row* — an empty-state line,
    // say — sends it away.
    else if (event.target !== frame.current && event.target !== list.current)
      hide();
  };

  const onPointerLeave = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") return;
    hovering.current = false;
    hide();
  };

  const onFocus = (event: FocusEvent<HTMLDivElement>) => {
    if (hovering.current) return;
    const row = rowUnder(event.target);
    if (row !== null && event.target.matches(":focus-visible")) glide(row);
  };

  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (hovering.current) return;
    if (rowUnder(event.relatedTarget) === null) hide();
  };

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
        aria-hidden
        className="pointer-events-none absolute -z-10 rounded-lg bg-foreground/[0.045] opacity-0 transition-[opacity,transform] duration-200 ease-out"
        style={{ transform: "scale(0.96)" }}
      />
      <ul ref={list} className={listClassName}>
        {children}
      </ul>
    </div>
  );
}
