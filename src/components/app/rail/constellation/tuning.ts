/**
 * The dials on `RailConstellation`, and the shape of a point in it.
 *
 * Kept apart from the canvas so the numbers can be read as a set — what a
 * frame costs, how far the pointer reaches, how the scatter flies — without
 * the loop that consumes them in the way. Every one of them is explained
 * where it is declared; the header of `rail-constellation.tsx` says what the
 * whole thing costs and why it is shaped the way it is.
 */

/** Longest line between two points, in CSS pixels. */
export const LINK = 112;
export const LINK2 = LINK * LINK;
/** How near the pointer has to be to join in, and to push. */
export const REACH = 172;
export const REACH2 = REACH * REACH;
/** How far a point is shoved at the very centre of that reach. */
export const SHOVE = 30;
/** One point per this many square pixels of rail. */
export const AREA_PER_POINT = 4800;
/** Ceiling on the field. The pair count is quadratic, so this is the budget. */
export const MAX_POINTS = 96;

/**
 * Backing-store resolution, capped.
 *
 * A retina buffer quadruples the raster cost of every frame to sharpen a
 * drawing with no edges in it — this is hairlines and 2px dots under a blur.
 * 1.5 is where the dots stop looking chewed; going to 2 buys nothing you can
 * see and costs 78% more pixels.
 */
export const MAX_DPR = 1.5;

/**
 * 30fps, not 60.
 *
 * Nothing here moves fast enough to alias at half rate — a point crosses the
 * rail in about a minute — and every per-frame cost above, the rail's seven
 * backdrop filters included, is charged per frame drawn.
 */
export const FRAME_MS = 1000 / 30;

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
export const QUIET_SPEED = 0.3;
export const QUIET_FADE = 0.35;
export const QUIET_FRAME_MS = 1000 / 15;
/** Per-frame easing of `calm` towards its target, at the running cadence. */
export const CALM_CHASE = 0.08;

/**
 * Per-frame drift and pointer easing, both stated for the 30fps cadence.
 *
 * These are doubled from their 60fps values so the motion is the same speed on
 * the wall clock. The easing is not exactly double — chasing at 0.12 twice
 * closes 22.6% of the gap, which is what 0.226 does in one step — because a
 * flat doubling would make the mesh snap to the cursor rather than trail it.
 */
export const DRIFT = 0.32;
export const CHASE = 0.226;

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
export const ALPHA_STEPS = 10;

/**
 * The old `mask-image` on the element, folded into the drawing: the fraction
 * of the height it softened at each end.
 */
export const HEM = 0.05;

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
export const SCATTER_MS = 900;
export const SCATTER_DISTANCE = 0.55;
export const SCATTER_NOISE = 0.45;
/**
 * The scatter runs at full rate. It is the one thing here that moves fast
 * enough to alias at 30fps — a point crosses a third of the screen in under
 * a second — and it is over before the cost of the extra frames matters.
 */
export const SCATTER_FRAME_MS = 1000 / 60;

export type Point = {
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
