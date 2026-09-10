import {
  ALPHA_STEPS,
  CHASE,
  DRIFT,
  LINK,
  LINK2,
  type Point,
  REACH,
  REACH2,
  SCATTER_DISTANCE,
  SCATTER_NOISE,
  SHOVE,
} from "@/components/app/constellation/tuning";

/**
 * The arithmetic of `RailConstellation`, with no canvas in it.
 *
 * Everything here takes the field and the frame's numbers as arguments and
 * reads nothing else: no element, no context, no state of the loop's. The
 * points are written in place — a frame that allocated a new array of
 * ninety-six objects thirty times a second would be paying for the one thing
 * the header of `rail-constellation.tsx` says the arithmetic does not cost —
 * and that is the only side effect any of these has. The loop that calls
 * them, and the drawing that follows, stay with the canvas.
 */

const random = (min: number, max: number) => min + Math.random() * (max - min);

/** A fresh point somewhere in the box, drifting at its own slow speed. */
export function seedPoint(width: number, height: number): Point {
  return {
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
  };
}

/**
 * Aim every point's throw: outward from the centre, with its own speed and
 * enough sideways noise that the web tears rather than scales.
 */
export function aimScatter(points: Point[], width: number, height: number) {
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
}

/**
 * One frame of movement for every point, and whether any of it is still
 * going.
 *
 * `speed` is the drift's per-frame step already scaled for the cadence and
 * the quiet setting; `flung` is how far into the scatter the field is. The
 * answer is true while any displacement is still easing — the drift itself
 * is the caller's to account for, since it knows whether reduced motion has
 * switched it off.
 */
export function stepPoints(
  points: Point[],
  {
    width,
    height,
    drifting,
    speed,
    pointer,
    flung,
  }: {
    width: number;
    height: number;
    drifting: boolean;
    speed: number;
    pointer: { x: number; y: number } | null;
    flung: number;
  },
): boolean {
  let moving = false;

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
}

/**
 * Every pair close enough to be joined, sorted into `buckets` by how strongly.
 *
 * The buckets are the caller's — one coordinate buffer per alpha step, kept
 * across frames — and are emptied here before they are filled, so the line
 * set is rebuilt without the arrays being.
 */
export function linkPairs(points: Point[], buckets: number[][]) {
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
}
