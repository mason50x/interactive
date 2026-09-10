import type { CSSProperties } from "react";

/**
 * The little floating pixel drawings on the libraries' empty states.
 *
 * `art` is a picture in rows of characters: `#` is a pixel on every plane,
 * `+` a pixel on the outermost two only, anything else is empty. The same
 * picture is laid out five times at different depths, and each pixel gets
 * its position and plane as CSS variables for the `dot-bubble` animation in
 * `globals.css` to bob and fade them by. `aria-hidden` because the drawing
 * only decorates the sentence next to it.
 */
const PLANES = [
  { z: 8, near: 1, far: 0.2, phase: 0 },
  { z: 4, near: 0.82, far: 0.34, phase: 0 },
  { z: 0, near: 0.55, far: 0.55, phase: 0 },
  { z: -4, near: 0.82, far: 0.34, phase: 0.5 },
  { z: -8, near: 1, far: 0.2, phase: 0.5 },
];

function pixels(art: readonly string[]) {
  return PLANES.flatMap((plane) =>
    art.flatMap((row, y) =>
      [...row].flatMap((cell, x) =>
        cell === "#" || (cell === "+" && Math.abs(plane.z) === 8)
          ? [
              {
                x: (x - (art[0].length - 1) / 2) * 4,
                y: (y - (art.length - 1) / 2) * 4,
                ...plane,
              },
            ]
          : [],
      ),
    ),
  );
}
export function PixelArt({ art }: { art: readonly string[] }) {
  return (
    <div
      aria-hidden="true"
      className="dot-bubble text-primary"
      style={{ width: 88, height: 60 }}
    >
      <div className="dot-bubble-shell">
        {pixels(art).map((pixel) => (
          <span
            key={`${pixel.z}:${pixel.x}:${pixel.y}`}
            className="dot-bubble-pixel"
            style={
              {
                "--x": pixel.x,
                "--y": pixel.y,
                "--z": pixel.z,
                "--near": pixel.near,
                "--far": pixel.far,
                "--phase": pixel.phase,
                "--rest": pixel.phase === 0 ? pixel.near : pixel.far,
              } as CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
}
