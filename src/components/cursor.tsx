"use client";

import { useEffect, useRef } from "react";

/**
 * The site cursor, drawn by the page so it can lean toward what it is over.
 *
 * The CSS cursor in `globals.css` is the same jet and stays the answer
 * wherever this cannot run: touch, the "System" cursor setting, reduced
 * motion, and inside frames that are not ours. While this is live it sets
 * `data-cursor-live` on <html>, which turns `--cursor` to `none`; the jet is
 * then drawn only where the resolved cursor really is `none`, so text fields,
 * resize handles and drag cursors keep the system's own.
 *
 * Over a button or link the jet is drawn most of the way toward the target's
 * centre, capped so it never leaves it. Rows under `data-cursor-snap="rail"`
 * lock the vertical outright, so running down the sidebar the jet glides from
 * one row's centre line to the next. The pointer itself is never moved or delayed: the jet is
 * placed on the same event that reports the pointer, and only the lean eases.
 */
export function Cursor() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const plane = ref.current;
    if (!plane) return;
    const root = document.documentElement;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)");

    let live = false;
    let shown = false;
    let x = 0;
    let y = 0;
    // The lean, and where it is heading.
    let ox = 0;
    let oy = 0;
    let tx = 0;
    let ty = 0;
    let target: Element | null = null;
    let rail = false;
    // What the pointer was last over, and whether the jet is drawn there.
    let over: EventTarget | null = null;
    let here = false;
    let frame = 0;
    let last = 0;

    const place = () => {
      plane.style.transform = `translate3d(${x + ox - HOT_X}px, ${y + oy - HOT_Y}px, 0)`;
    };

    const show = (on: boolean) => {
      if (on === shown) return;
      shown = on;
      plane.toggleAttribute("data-on", on);
    };

    const aim = () => {
      if (!target) {
        tx = 0;
        ty = 0;
        return;
      }
      const box = target.getBoundingClientRect();
      const dx = box.left + box.width / 2 - x;
      const dy = box.top + box.height / 2 - y;
      // A rail row locks the jet onto its centre line; anything else draws
      // it a good way toward the middle without leaving the target.
      tx = rail ? clamp(dx * 0.1, 6) : clamp(dx * 0.4, 12);
      ty = rail ? clamp(dy, 24) : clamp(dy * 0.4, 12);
    };

    const tick = (now: number) => {
      const dt = Math.min(now - last, 64);
      last = now;
      const k = 1 - Math.exp(-dt / EASE_MS);
      ox += (tx - ox) * k;
      oy += (ty - oy) * k;
      place();
      frame =
        Math.abs(tx - ox) > 0.05 || Math.abs(ty - oy) > 0.05
          ? requestAnimationFrame(tick)
          : 0;
    };

    const settle = () => {
      if (frame) return;
      last = performance.now();
      frame = requestAnimationFrame(tick);
    };

    // Only when the element under the pointer changes: a computed style per
    // move would be a style read on every event.
    const enter = (el: EventTarget | null) => {
      over = el;
      here = drawnHere(el);
      const hit = el instanceof Element ? el.closest(SNAP) : null;
      const box = hit?.getBoundingClientRect();
      target = box && box.width <= MAX_W && box.height <= MAX_H ? hit : null;
      rail = !!target?.closest('[data-cursor-snap="rail"]');
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return show(false);
      if (event.target !== over) enter(event.target);
      x = event.clientX;
      y = event.clientY;
      aim();
      // Arriving from off the page, start already leaning rather than
      // sliding in from wherever the jet was last seen.
      if (!shown) {
        ox = tx;
        oy = ty;
      }
      place();
      settle();
      show(here);
    };

    const onScroll = () => {
      over = null;
      aim();
      settle();
    };

    const onOut = (event: PointerEvent) => {
      // Off the page, or into a frame, which draws its own.
      const next = event.relatedTarget;
      if (!next || next instanceof HTMLIFrameElement) show(false);
    };

    const onDown = () => plane.setAttribute("data-press", "");
    const onUp = () => plane.removeAttribute("data-press");
    const hide = () => show(false);

    const start = () => {
      live = true;
      root.setAttribute("data-cursor-live", "");
      window.addEventListener("pointermove", onMove, { passive: true });
      document.addEventListener("pointerout", onOut, { passive: true });
      window.addEventListener("pointerdown", onDown, { passive: true });
      window.addEventListener("pointerup", onUp, { passive: true });
      window.addEventListener("blur", hide);
      document.addEventListener("dragstart", hide);
      window.addEventListener("scroll", onScroll, {
        passive: true,
        capture: true,
      });
    };

    const stop = () => {
      live = false;
      root.removeAttribute("data-cursor-live");
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerout", onOut);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("blur", hide);
      document.removeEventListener("dragstart", hide);
      window.removeEventListener("scroll", onScroll, { capture: true });
      cancelAnimationFrame(frame);
      frame = 0;
      show(false);
    };

    const sync = () => {
      const want =
        fine.matches &&
        !calm.matches &&
        root.getAttribute("data-pref-cursor") !== "system" &&
        root.getAttribute("data-pref-motion") !== "reduce";
      if (want && !live) start();
      else if (!want && live) stop();
    };

    sync();
    fine.addEventListener("change", sync);
    calm.addEventListener("change", sync);
    const watch = new MutationObserver(sync);
    watch.observe(root, {
      attributes: true,
      attributeFilter: ["data-pref-cursor", "data-pref-motion"],
    });

    return () => {
      stop();
      fine.removeEventListener("change", sync);
      calm.removeEventListener("change", sync);
      watch.disconnect();
    };
  }, []);

  return (
    <div ref={ref} className="cursor-plane" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path className="cursor-plane-edge" d={JET} />
        <path className="cursor-plane-body" d={JET} />
      </svg>
    </div>
  );
}

/** Where the jet is drawn: wherever the page asked for no cursor at all. */
function drawnHere(target: EventTarget | null): boolean {
  if (!(target instanceof Element) || target instanceof HTMLIFrameElement) {
    return false;
  }
  return getComputedStyle(target).cursor === "none";
}

function clamp(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
}

const SNAP = [
  "a[href]",
  "button:not(:disabled)",
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="option"]',
  "summary",
].join(",");

/** Past this size a target is a card or a panel, and a pull would feel odd. */
const MAX_W = 320;
const MAX_H = 96;

const EASE_MS = 90;

/** The nose, in pixels from the top left of the 28px box. */
const HOT_X = 5.5;
const HOT_Y = 5;

/** Same jet as the CSS cursor in `globals.css`. */
const JET =
  "M5.0 4.5 7.59 7.13 9.18 9.2 14.85 10.26 15.38 11.1 10.92 12.0 11.96 13.95 13.79 14.22 14.16 14.81 11.89 15.52 10.26 17.25 9.89 16.66 10.44 14.9 9.14 13.11 6.39 16.72 5.86 15.87 7.4 10.31 6.23 7.98Z";
