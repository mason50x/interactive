"use client";

import { useEffect, useRef } from "react";
import {
  aimScatter,
  linkPairs,
  seedPoint,
  stepPoints,
} from "@/components/app/constellation/simulation";
import {
  ALPHA_STEPS,
  AREA_PER_POINT,
  CALM_CHASE,
  FRAME_MS,
  HEM,
  MAX_DPR,
  MAX_POINTS,
  type Point,
  QUIET_FADE,
  QUIET_FRAME_MS,
  QUIET_SPEED,
  REACH2,
  REACH,
  SCATTER_FRAME_MS,
  SCATTER_MS,
} from "@/components/app/constellation/tuning";
import { cn } from "@/lib/utils";

/**
 * A constellation on the rail, drawn live and wired to the cursor.
 *
 * Points drift on their own, and every pair closer than `LINK` is joined by a
 * line whose strength falls off with the gap between them — so the web makes
 * and breaks itself as they move, rather than being a fixed set of edges that
 * slides around. The pointer is one more node in that web: it links to
 * everything near it, and pushes those same points aside, so the mesh bulges
 * and re-knits around the cursor as it travels down the rail.
 *
 * Canvas, not SVG. The edge set is recomputed every frame — a few hundred
 * lines a second, most of them lasting under a second — and putting that
 * through React or the DOM would be a re-render per frame for something with
 * no semantics and no interactivity of its own.
 *
 * The push is applied as a *displacement* over drifting base positions, eased
 * back to zero when the pointer leaves, rather than as a force on velocity.
 * Force accumulates: a cursor swept up and down the rail a few times leaves
 * the field flung to the edges and never settles. This cannot.
 *
 * Nothing here dodges the rail's content, because the content dodges it: the
 * wordmark, the unlit nav rows and the account button all carry a small
 * `backdrop-blur`, which throws the web out of focus exactly where a label
 * needs to be read and nowhere else. That is what lets this run at a strength
 * you can actually see, edge to edge, instead of hiding in the middle band.
 *
 * It draws in the foreground colour, read off the canvas itself, so it
 * inverts with the theme: dark web on the light rail, light web on the dark
 * one.
 *
 * ---------------------------------------------------------------------------
 * What this costs, and why it is shaped the way it is
 *
 * The arithmetic was never the problem: the whole step — drift, the pointer
 * field, ~990 pair tests and ~150 line segments — measures at 0.2ms, which is
 * a rounding error against a 16ms frame. What costs is everything downstream
 * of it, and all of that scales with *pixels* and *frames*, not with points:
 *
 *   - The canvas is the full height of the viewport. At `devicePixelRatio` 2
 *     that was an 860,000-pixel surface being cleared and re-rastered 60 times
 *     a second, for a drawing that is a few hundred hairlines.
 *   - Seven `backdrop-filter` elements sit on top of it (see above). A
 *     backdrop filter has to re-read, blur and recomposite its backdrop on
 *     every frame that backdrop changes — and this backdrop changes on every
 *     frame by construction. Halving the frame rate halves that bill too.
 *   - A CSS `mask-image` and an `opacity` on a layer that is dirty every frame
 *     make the compositor resolve the subtree into an intermediate texture
 *     before any of those filters can sample it. Both are now done in the
 *     drawing instead, where they are two gradient bands and a multiplier, so
 *     the element is a plain layer again.
 *
 * Hence: a capped backing store, a 30fps cadence, and a loop that actually
 * stops when there is nothing left to move. None of it changes what you see.
 *
 * The dials are in `constellation/tuning.ts` and the arithmetic — seeding,
 * stepping, scattering, linking — in `constellation/simulation.ts`, neither
 * of which knows there is a canvas. What is left here is the canvas: the
 * loop, its gates, the drawing, and the wiring that keeps all three honest.
 */

/**
 * The defaults are the rail's. `/auth` mounts the same field behind a whole
 * page — a far larger box for the same budget of points, and one with no
 * backdrop filters over it to soften the web where something has to be read —
 * so the spacing and the ceiling are dials rather than constants.
 *
 * Strength is not a prop, because it is already a CSS custom property with a
 * value per theme: a caller turns the web down by overriding `--web-fade` in
 * `className`, and has to override the `dark:` variant too or the dark side
 * keeps the rail's own setting.
 */
export function RailConstellation({
  className,
  areaPerPoint = AREA_PER_POINT,
  maxPoints = MAX_POINTS,
  quiet = false,
  scatter = false,
  vignette = false,
}: {
  className?: string;
  areaPerPoint?: number;
  maxPoints?: number;
  /** Dim and slow the web while something beside it needs the machine. */
  quiet?: boolean;
  /**
   * Blow the field apart. On the turn to `true` every point is thrown
   * outward from the centre over `SCATTER_MS`, the web breaking into
   * particles as they part — for a page that is about to leave. One-way:
   * the field does not come back together. Skipped under reduced motion.
   */
  scatter?: boolean;
  /**
   * Fade the web out towards every edge, not only the top and bottom hem —
   * for a field behind a whole page, where the eye should be held at the
   * centre and the corners should not read as a hard box.
   */
  vignette?: boolean;
} = {}) {
  const canvas = useRef<HTMLCanvasElement>(null);

  // `quiet` reaches the loop through a ref rather than as a dependency of the
  // effect below: re-running that effect re-seeds the field, and a web that
  // scatters and re-forms every time an activity opens is a flicker, not a
  // change of mood. The second ref is how a change of `quiet` wakes a loop
  // that had settled and stopped — under reduced motion, or with nothing left
  // to move — so the easing towards the new setting actually gets drawn.
  const quietRef = useRef(quiet);
  const scatterRef = useRef(scatter);
  const wake = useRef<() => void>(null);
  useEffect(() => {
    quietRef.current = quiet;
    wake.current?.();
  }, [quiet]);
  useEffect(() => {
    scatterRef.current = scatter;
    wake.current?.();
  }, [scatter]);

  useEffect(() => {
    const element = canvas.current;
    const rail = element?.parentElement;
    if (!element || !rail) return;

    const context = element.getContext("2d");
    if (!context) return;

    const still = window.matchMedia("(prefers-reduced-motion: reduce)");

    let width = 0;
    let height = 0;
    let points: Point[] = [];
    let pointer: { x: number; y: number } | null = null;
    let frame = 0;
    let last = 0;
    // How far into the quiet setting the web has eased: 0 is the full web, 1
    // is fully dimmed and slowed. Chases `quietRef` a step per frame.
    let calm = quietRef.current ? 1 : 0;
    // How far the scatter has flown: 0 is the field at rest, 1 is every point
    // at the end of its throw. Run off the clock rather than per frame so a
    // dropped frame does not slow the release. `scatterStart` is 0 until the
    // throw begins.
    let flung = 0;
    let scatterStart = 0;
    // The scatter's own fade, drawn into the alphas. The page fades with it,
    // but it must not fade *through* this canvas: an `opacity` on a layer
    // that is dirty every frame is a full-screen texture per frame.
    let gone = 0;

    // The two halves of "is anyone actually looking at this", and their
    // conjunction. Only `onscreen` gates the loop; see `settle`.
    let visible = !document.hidden;
    let intersecting = true;
    let onscreen = visible;

    // One reusable pair of coordinate buffers per alpha bucket. The line set
    // changes completely every frame but its *size* barely moves, so these
    // are filled and truncated rather than rebuilt.
    const buckets: number[][] = Array.from({ length: ALPHA_STEPS }, () => []);

    // Both read off the canvas rather than hard-coded, so the theme toggle
    // carries them: the element is `text-foreground`, and `currentColor` is
    // not a thing a 2D context understands. `--web-fade` is what used to be
    // the element's `opacity`, which is a property the compositor cannot be
    // given for free on a layer that is dirty every frame — as a custom
    // property it still has a light value and a dark one, and it arrives here
    // as a multiplier on the alphas instead.
    let ink = "0, 0, 0";
    let themeFade = 0.8;
    // The vignette, built once per size in `measure`: clear at the centre,
    // gone by the corners. The radius reaches the corner rather than the
    // nearer edge so nothing along the long sides is cut off flat.
    let ring: CanvasGradient | string = "transparent";
    const readInk = () => {
      const style = getComputedStyle(element);

      const parts = style.color.match(/[\d.]+/g);
      if (parts && parts.length >= 3) ink = parts.slice(0, 3).join(", ");

      const declared = Number.parseFloat(style.getPropertyValue("--web-fade"));
      if (Number.isFinite(declared)) themeFade = declared;
    };

    // Points are seeded once per size, and kept across a resize where they
    // can be: a field that re-scatters every time the window edge moves is a
    // flicker, not a drift.
    const measure = () => {
      const box = rail.getBoundingClientRect();
      if (!box.width || !box.height) return;

      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      width = box.width;
      height = box.height;
      element.width = Math.round(width * dpr);
      element.height = Math.round(height * dpr);
      element.style.width = `${width}px`;
      element.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (vignette) {
        const cx = width / 2;
        const cy = height / 2;
        const gradient = context.createRadialGradient(
          cx,
          cy,
          0,
          cx,
          cy,
          Math.hypot(cx, cy),
        );
        gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
        gradient.addColorStop(0.45, "rgba(0, 0, 0, 0)");
        gradient.addColorStop(1, "rgba(0, 0, 0, 1)");
        ring = gradient;
      }

      const wanted = Math.max(
        14,
        Math.min(maxPoints, Math.round((width * height) / areaPerPoint)),
      );

      points = points.filter((point) => point.x < width && point.y < height);
      while (points.length > wanted) points.pop();
      while (points.length < wanted) points.push(seedPoint(width, height));
    };

    /**
     * Advance the field, and say whether anything is still moving.
     *
     * The answer only ever matters under reduced motion, where the drift is
     * switched off: with no pointer in the rail and every displacement eased
     * back to zero, the next frame is identical to this one and the loop can
     * be put down until the cursor comes back. Left running, that case redrew
     * the same picture thirty times a second for the life of the session.
     */
    const advance = () => {
      const drifting = !still.matches;
      let moving = drifting;

      const wanted = quietRef.current ? 1 : 0;
      calm += (wanted - calm) * CALM_CHASE;
      if (Math.abs(wanted - calm) < 0.005) calm = wanted;
      else moving = true;

      if (scatterRef.current && !still.matches) {
        if (!scatterStart) {
          scatterStart = performance.now();
          aimScatter(points, width, height);
        }
        if (flung < 1) {
          const t = Math.min(
            1,
            (performance.now() - scatterStart) / SCATTER_MS,
          );
          flung = 1 - (1 - t) ** 2;
          gone = t;
          moving = true;
        }
      }

      // The drift is stated per frame at 30fps. The quiet cadence is half
      // that, so the per-frame step is scaled up by the same factor to keep
      // the wall-clock speed at exactly `QUIET_SPEED` of normal rather than
      // half of it again.
      const speed = (1 - calm * (1 - QUIET_SPEED)) * (cadence() / FRAME_MS);

      if (
        stepPoints(points, { width, height, drifting, speed, pointer, flung })
      ) {
        moving = true;
      }

      return moving;
    };

    const draw = () => {
      context.clearRect(0, 0, width, height);
      context.lineWidth = 0.9;

      // The theme's strength, stepped down by however quiet the web is now,
      // and by how far into the scatter it has got.
      const fade = themeFade * (1 - calm * (1 - QUIET_FADE)) * (1 - gone);

      linkPairs(points, buckets);

      for (let step = 0; step < ALPHA_STEPS; step++) {
        const bucket = buckets[step];
        if (bucket.length === 0) continue;

        const alpha = ((step + 0.5) / ALPHA_STEPS) * 0.5 * fade;
        context.strokeStyle = `rgba(${ink}, ${alpha})`;
        context.beginPath();
        for (let k = 0; k < bucket.length; k += 4) {
          context.moveTo(bucket[k], bucket[k + 1]);
          context.lineTo(bucket[k + 2], bucket[k + 3]);
        }
        context.stroke();
      }

      if (pointer) {
        for (const point of points) {
          const ax = point.px - pointer.x;
          const ay = point.py - pointer.y;
          const d2 = ax * ax + ay * ay;
          if (d2 >= REACH2) continue;

          // Brighter than the web's own lines: these are what says the cursor
          // is part of it, and at the same weight they read as noise. Not
          // batched — there are at most a handful, and they are the one thing
          // here whose gradient of opacity is actually looked at.
          const strength = 1 - Math.sqrt(d2) / REACH;
          context.strokeStyle = `rgba(${ink}, ${strength * 0.85 * fade})`;
          context.beginPath();
          context.moveTo(point.px, point.py);
          context.lineTo(pointer.x, pointer.y);
          context.stroke();
        }
      }

      context.fillStyle = `rgba(${ink}, ${0.8 * fade})`;
      context.beginPath();
      for (const point of points) {
        context.moveTo(point.px + point.r, point.py);
        context.arc(point.px, point.py, point.r, 0, Math.PI * 2);
      }
      context.fill();

      // The hem that used to be a CSS `mask-image`. Doing it here is two thin
      // gradient bands over a surface that was going to be re-rastered anyway;
      // doing it in CSS made the whole element a masked layer that seven
      // backdrop filters then had to resolve before they could read it.
      context.globalCompositeOperation = "destination-out";

      if (vignette) {
        context.fillStyle = ring;
        context.fillRect(0, 0, width, height);
      } else {
        const hem = height * HEM;

        const top = context.createLinearGradient(0, 0, 0, hem);
        top.addColorStop(0, "rgba(0, 0, 0, 1)");
        top.addColorStop(1, "rgba(0, 0, 0, 0)");
        context.fillStyle = top;
        context.fillRect(0, 0, width, hem);

        const bottom = context.createLinearGradient(0, height - hem, 0, height);
        bottom.addColorStop(0, "rgba(0, 0, 0, 0)");
        bottom.addColorStop(1, "rgba(0, 0, 0, 1)");
        context.fillStyle = bottom;
        context.fillRect(0, height - hem, width, hem);
      }

      context.globalCompositeOperation = "source-over";
    };

    /**
     * One frame, whatever the loop is doing.
     *
     * `measure` blanks the canvas — assigning `width` resets the backing store
     * — so everything that measures owes the field a redraw, and `start` is
     * not able to be that redraw: it refuses while the rail is offscreen, and
     * an offscreen rail is exactly when a resize is most likely to arrive.
     * The canvas is then left cleared with nothing scheduled to fill it in,
     * and stays that way until something unrelated happens to restart the
     * loop. That is the field vanishing for no reason anyone can point at.
     *
     * A hidden tab runs no rAF callbacks, which is why this draws inline
     * rather than asking for a frame: the picture is there and correct
     * whenever the tab is looked at again.
     */
    const paint = () => {
      advance();
      draw();
    };

    // The frame gate in force: the quiet one only once the web has fully
    // settled into it, so the easing in and out is drawn at full cadence.
    const cadence = () =>
      scatterStart && flung < 1
        ? SCATTER_FRAME_MS
        : calm >= 1
          ? QUIET_FRAME_MS
          : FRAME_MS;

    const step = (now: number) => {
      // rAF is tied to the display, so 30fps is a gate rather than a timer.
      // The slack keeps a frame that lands a hair early from being dropped
      // outright, which is what turns a steady 30 into a stuttering 20.
      if (now - last < cadence() - 2) {
        frame = requestAnimationFrame(step);
        return;
      }
      last = now;

      const moving = advance();
      draw();

      // Under reduced motion this is where it stops. `pointermove` starts it
      // again, and nothing else can change the picture.
      frame = moving ? requestAnimationFrame(step) : 0;
    };

    const start = () => {
      if (frame || !onscreen) return;
      last = 0;
      frame = requestAnimationFrame(step);
    };

    const stop = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };

    const onMove = (event: PointerEvent) => {
      const box = rail.getBoundingClientRect();
      pointer = { x: event.clientX - box.left, y: event.clientY - box.top };
      start();
    };
    const onLeave = () => {
      pointer = null;
      // The displacements still have to ease back out, so this restarts the
      // loop rather than leaving the mesh dented where the cursor left it.
      start();
    };

    // Nothing to draw against a tab nobody is looking at, and an unthrottled
    // rAF in a background tab is a laptop fan. The observer covers the other
    // half of that: the rail scrolled or collapsed out of view.
    //
    // The two conditions are tracked apart and combined here, because either
    // source recomputing both would let the one that did not change overwrite
    // what the other knows — a tab coming to the front would restart a loop
    // for a rail that is still scrolled off screen, and the observer, which
    // does not fire again on that, would never correct it.
    const settle = () => {
      onscreen = visible && intersecting;
      if (onscreen) start();
      else stop();
    };

    const onVisibility = () => {
      visible = !document.hidden;
      settle();
    };

    // The *last* entry, not the first. One callback can carry several
    // notifications — a slow machine is precisely what makes the observer
    // coalesce them — and `[entry]` reads the oldest of the batch. A gone-and
    // -returned rail delivered in one call would leave this parked as
    // offscreen, holding a stopped loop, with nothing left to correct it: no
    // further notification is owed, and `start` refuses every other caller
    // while `onscreen` is false, the pointer included.
    const seen = new IntersectionObserver((entries) => {
      intersecting = entries[entries.length - 1].isIntersecting;
      settle();
    });

    readInk();
    measure();
    start();

    const resize = new ResizeObserver(() => {
      measure();
      paint();
      start();
    });
    resize.observe(rail);
    seen.observe(element);

    // The theme is a `data-theme` swap on <html>, not a media query, so this
    // is what tells the canvas its ink just inverted — and, if the field had
    // settled, that it has a frame to redraw in the new colour.
    const theme = new MutationObserver(() => {
      readInk();
      start();
    });
    theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    /**
     * The backing store, taken away and given back.
     *
     * Chrome discards 2D canvas buffers under memory pressure and says so
     * with these two events. A 4GB Chromebook lives under memory pressure, so
     * this is not the edge case it looks like — and the failure is total and
     * permanent: a lost context swallows every draw call, and a restored one
     * arrives blank, at the default transform, having forgotten the device
     * -pixel scale `measure` set on it. Without this the field goes and does
     * not come back, or comes back drawn at 1x into a 1.5x buffer, which is a
     * quarter-size web in the top-left corner.
     *
     * The event is deliberately not cancelled: cancelling `contextlost` is
     * what tells the browser *not* to restore the context.
     */
    const onLost = () => stop();
    const onRestored = () => {
      readInk();
      measure();
      paint();
      start();
    };
    element.addEventListener("contextlost", onLost);
    element.addEventListener("contextrestored", onRestored);

    // Turning reduced motion on has to be able to stop a running loop, and
    // turning it off has to be able to start a stopped one.
    const onStillness = () => start();
    still.addEventListener("change", onStillness);

    rail.addEventListener("pointermove", onMove);
    rail.addEventListener("pointerleave", onLeave);
    document.addEventListener("visibilitychange", onVisibility);

    wake.current = start;

    return () => {
      wake.current = null;
      stop();
      resize.disconnect();
      seen.disconnect();
      theme.disconnect();
      still.removeEventListener("change", onStillness);
      element.removeEventListener("contextlost", onLost);
      element.removeEventListener("contextrestored", onRestored);
      rail.removeEventListener("pointermove", onMove);
      rail.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [areaPerPoint, maxPoints, vignette]);

  return (
    <canvas
      ref={canvas}
      aria-hidden
      // No `opacity` and no `mask-image`. Both are in the drawing now — see
      // `--web-fade` and `HEM` — because on a layer that is dirty every frame
      // they are what forces the compositor to resolve this subtree into its
      // own texture before the rail's backdrop filters can sample it.
      //
      // `--web-fade` still carries the theme's two strengths, and still does
      // it in CSS where the rest of the theming lives; it just arrives as a
      // number the drawing multiplies rather than as a property on the layer.
      className={cn(
        "pointer-events-none absolute inset-0 -z-10 text-foreground [--web-fade:0.8] dark:[--web-fade:0.72]",
        className,
      )}
    />
  );
}
