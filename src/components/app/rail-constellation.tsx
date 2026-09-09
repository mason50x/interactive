"use client";

import { useEffect, useRef } from "react";
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
 */

/** Longest line between two points, in CSS pixels. */
const LINK = 112;
const LINK2 = LINK * LINK;
/** How near the pointer has to be to join in, and to push. */
const REACH = 172;
const REACH2 = REACH * REACH;
/** How far a point is shoved at the very centre of that reach. */
const SHOVE = 30;
/** One point per this many square pixels of rail. */
const AREA_PER_POINT = 4800;
/** Ceiling on the field. The pair count is quadratic, so this is the budget. */
const MAX_POINTS = 96;

/**
 * Backing-store resolution, capped.
 *
 * A retina buffer quadruples the raster cost of every frame to sharpen a
 * drawing with no edges in it — this is hairlines and 2px dots under a blur.
 * 1.5 is where the dots stop looking chewed; going to 2 buys nothing you can
 * see and costs 78% more pixels.
 */
const MAX_DPR = 1.5;

/**
 * 30fps, not 60.
 *
 * Nothing here moves fast enough to alias at half rate — a point crosses the
 * rail in about a minute — and every per-frame cost above, the rail's seven
 * backdrop filters included, is charged per frame drawn.
 */
const FRAME_MS = 1000 / 30;

/**
 * The quiet setting, for when an activity is running beside the rail.
 *
 * An activity is the most expensive thing this app puts on a screen, and the
 * web is decoration; it used to come off entirely while one ran. Now it stays
 * and steps back instead: the drift at under a third of its speed, the ink at
 * a third of its strength, and the loop at half its cadence. The cadence is
 * the part that pays — every per-frame cost above, the rail's backdrop
 * filters included, is charged per frame drawn, and at this speed 15fps
 * aliases nothing.
 *
 * Both are eased in and out (see `calm`) rather than switched, so leaving an
 * activity is the web waking up, not a cut.
 */
const QUIET_SPEED = 0.3;
const QUIET_FADE = 0.35;
const QUIET_FRAME_MS = 1000 / 15;
/** Per-frame easing of `calm` towards its target, at the running cadence. */
const CALM_CHASE = 0.08;

/**
 * Per-frame drift and pointer easing, both stated for the 30fps cadence.
 *
 * These are doubled from their 60fps values so the motion is the same speed on
 * the wall clock. The easing is not exactly double — chasing at 0.12 twice
 * closes 22.6% of the gap, which is what 0.226 does in one step — because a
 * flat doubling would make the mesh snap to the cursor rather than trail it.
 */
const DRIFT = 0.32;
const CHASE = 0.226;

/**
 * Line alphas are quantised into this many steps so the whole web can be drawn
 * as a handful of paths.
 *
 * Every segment has its own opacity, and a distinct `strokeStyle` means its
 * own `beginPath`/`stroke` — ~150 separate draw calls a frame, each preceded
 * by building a fresh `rgba(...)` string. Rounding those alphas to 1/10ths
 * collapses them into ten batched paths. The banding is not visible on a
 * hairline at 8% opacity; the difference in draw calls is fifteenfold.
 */
const ALPHA_STEPS = 10;

/**
 * The old `mask-image` on the element, folded into the drawing: the fraction
 * of the height it softened at each end.
 */
const HEM = 0.05;

/**
 * The `scatter`: how long the field takes to fly apart, and how far.
 *
 * Every point is thrown outward from the centre with its own speed and a
 * little sideways noise, so the web does not simply scale up — pairs part at
 * different rates, their lines snap as they pass `LINK`, and what is left is
 * loose particles. Eased out, so the throw is sharp and the drift after it
 * long. The distance is a fraction of the box's longer side, enough to carry
 * the outer points off the edge.
 */
const SCATTER_MS = 900;
const SCATTER_DISTANCE = 0.55;
const SCATTER_NOISE = 0.45;
/**
 * The scatter runs at full rate. It is the one thing here that moves fast
 * enough to alias at 30fps — a point crosses a third of the screen in under
 * a second — and it is over before the cost of the extra frames matters.
 */
const SCATTER_FRAME_MS = 1000 / 60;

type Point = {
  /** Where the drift has got to, before the pointer has any say. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  /** Current offset from the pointer, and where it is heading. */
  dx: number;
  dy: number;
  tx: number;
  ty: number;
  /** Where the scatter throws this point, at full extent. */
  sx: number;
  sy: number;
  /** `x + dx`, `y + dy` — held here so a frame allocates nothing. */
  px: number;
  py: number;
};

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

    // Aim every point's throw: outward from the centre, with its own speed
    // and enough sideways noise that the web tears rather than scales.
    const aim = () => {
      const cx = width / 2;
      const cy = height / 2;
      const reach = Math.max(width, height) * SCATTER_DISTANCE;
      for (const point of points) {
        const ax = point.x - cx;
        const ay = point.y - cy;
        const distance = Math.hypot(ax, ay) || 1;
        const speed = reach * random(0.6, 1.4);
        point.sx = (ax / distance + random(-SCATTER_NOISE, SCATTER_NOISE)) * speed;
        point.sy = (ay / distance + random(-SCATTER_NOISE, SCATTER_NOISE)) * speed;
      }
    };
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

    const random = (min: number, max: number) =>
      min + Math.random() * (max - min);

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
        const gradient = context.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(cx, cy));
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
      while (points.length < wanted) {
        points.push({
          x: random(0, width),
          y: random(0, height),
          // Slow enough that the web looks like it is breathing rather than
          // travelling: a point crosses the rail in something like a minute.
          vx: random(-DRIFT, DRIFT),
          vy: random(-DRIFT, DRIFT),
          r: random(1.1, 2.3),
          dx: 0,
          dy: 0,
          tx: 0,
          ty: 0,
          sx: 0,
          sy: 0,
          px: 0,
          py: 0,
        });
      }
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
          aim();
        }
        if (flung < 1) {
          const t = Math.min(1, (performance.now() - scatterStart) / SCATTER_MS);
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

      for (const point of points) {
        if (drifting) {
          point.x += point.vx * speed;
          point.y += point.vy * speed;

          // Wrapped, not bounced. A bounce puts every point on a fixed path
          // and the field visibly paces its box; wrapping keeps it wandering.
          if (point.x < -LINK) point.x = width + LINK;
          if (point.x > width + LINK) point.x = -LINK;
          if (point.y < -LINK) point.y = height + LINK;
          if (point.y > height + LINK) point.y = -LINK;
        }

        point.tx = 0;
        point.ty = 0;

        if (pointer) {
          const ax = point.x - pointer.x;
          const ay = point.y - pointer.y;
          const d2 = ax * ax + ay * ay;

          if (d2 < REACH2) {
            const distance = Math.sqrt(d2) || 1;
            // Squared falloff, so the shove is a dent under the cursor rather
            // than a slope across the whole neighbourhood.
            const strength = (1 - distance / REACH) ** 2 * SHOVE;
            point.tx = (ax / distance) * strength;
            point.ty = (ay / distance) * strength;
          }
        }

        // Chasing the target instead of snapping to it is what makes the mesh
        // trail the cursor and settle behind it.
        point.dx += (point.tx - point.dx) * CHASE;
        point.dy += (point.ty - point.dy) * CHASE;

        // A tenth of a pixel is under the smallest thing this can draw.
        if (Math.abs(point.dx) > 0.1 || Math.abs(point.dy) > 0.1) moving = true;

        point.px = point.x + point.dx + point.sx * flung;
        point.py = point.y + point.dy + point.sy * flung;
      }

      return moving;
    };

    const draw = () => {
      context.clearRect(0, 0, width, height);
      context.lineWidth = 0.9;

      // The theme's strength, stepped down by however quiet the web is now,
      // and by how far into the scatter it has got.
      const fade = themeFade * (1 - calm * (1 - QUIET_FADE)) * (1 - gone);

      for (const bucket of buckets) bucket.length = 0;

      for (let i = 0; i < points.length; i++) {
        const a = points[i];
        for (let j = i + 1; j < points.length; j++) {
          const b = points[j];
          const ax = a.px - b.px;
          const ay = a.py - b.py;
          const d2 = ax * ax + ay * ay;
          if (d2 >= LINK2) continue;

          // The square root is paid only by the pairs that survive — about a
          // sixth of them — where the old code took a `Math.hypot` on all 990.
          const strength = 1 - Math.sqrt(d2) / LINK;
          const bucket =
            buckets[Math.min(ALPHA_STEPS - 1, (strength * ALPHA_STEPS) | 0)];
          bucket.push(a.px, a.py, b.px, b.py);
        }
      }

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
