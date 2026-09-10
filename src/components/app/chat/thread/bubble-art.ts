/**
 * The empty thread's speech bubble, as data.
 *
 * Kept apart from the component that draws it because the data is the whole
 * of the drawing: the shape is worth reading in the source, and the planes
 * and pixels are computed once at module load rather than on every render of
 * an empty conversation. See `Quiet` for what is done with them and
 * `.dot-bubble` in `globals.css` for how the pixels are moved.
 */

/**
 * The speech bubble, drawn once as characters.
 *
 * A `#` is a dot on a 4px grid: eight rows of a rounded rectangle and two more
 * for the tail hanging off its bottom-left corner. Written this way because the
 * shape is the only thing about it worth reading, and a list of coordinates
 * hides that behind arithmetic — here you can see the bubble in the source.
 */
const BUBBLE_ART = [
  "..#########..",
  ".#.........#.",
  "#...........#",
  "#...........#",
  "#...........#",
  "#...........#",
  ".#.........#.",
  "..#########..",
  "..##.........",
  "..#..........",
] as const;

/**
 * The five planes the outline is repeated across, near to far, and the cycle
 * each one's brightness runs over a revolution.
 *
 * 4px apart, which is the grid's own pitch — the bubble is then one cube size
 * in all three directions, and the wall reads as stacked pixels rather than as
 * a shape smeared backwards. Five of them and not three because the quarter of
 * the turn where the bubble is edge-on is all wall, and a wall wants some
 * thickness to be one.
 *
 * `near` is what a plane is worth facing the camera and `far` what it is worth
 * hidden behind the others; `phase` is the half-revolution offset that puts the
 * back planes on the far end of the cycle while the front ones are on the near
 * end. The amplitude narrows toward the middle because a plane nearer the axis
 * swings less in depth, and the one *on* the axis does not move at all — so its
 * two ends are the same number and its cycle is a flat line.
 *
 * `rest` is where that cycle sits at the angle the bubble rests at, written
 * onto the dot as its plain opacity so a bubble with its animations collapsed
 * is still a *shaded* bubble. See `.dot-bubble-pixel` in `globals.css`.
 */
const BUBBLE_PLANES = [
  { z: 8, near: 1, far: 0.2, phase: 0 },
  { z: 4, near: 0.82, far: 0.34, phase: 0 },
  { z: 0, near: 0.55, far: 0.55, phase: 0 },
  { z: -4, near: 0.82, far: 0.34, phase: 0.5 },
  { z: -8, near: 1, far: 0.2, phase: 0.5 },
] as const;

/**
 * Every pixel of the wall, placed once at module load.
 *
 * The art's centre is the origin: the grid is thirteen wide and ten tall, so
 * halving those puts (0, 0) in the middle of the whole drawing, tail included.
 * That means the bubble body sits a little high in the box, which is where a
 * bubble with a tail belongs.
 */
export const BUBBLE_PIXELS = BUBBLE_PLANES.flatMap((plane) =>
  BUBBLE_ART.flatMap((row, y) =>
    [...row].flatMap((cell, x) =>
      cell === "#"
        ? [
            {
              key: `${plane.z}:${x}:${y}`,
              x: (x - 6) * 4,
              y: (y - 4.5) * 4,
              z: plane.z,
              near: plane.near,
              far: plane.far,
              phase: plane.phase,
              // The resting angle is a shallow turn away from face-on, so the
              // front of the bubble is still the front of it: each plane rests
              // at whichever end of its own cycle it is nearest.
              rest: plane.phase === 0 ? plane.near : plane.far,
            },
          ]
        : [],
    ),
  ),
);

/**
 * The three dots inside it. Centred across the body and on its middle line,
 * two grid cells apart. Their depth is the near plane's and is written in the
 * stylesheet instead of here, because it is the same 8px in four keyframes.
 */
export const BUBBLE_SAYING = [-8, 0, 8];
