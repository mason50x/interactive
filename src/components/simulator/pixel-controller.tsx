import type { CSSProperties } from "react";

// The same 4px grid, depth planes, and rotating shading as chat's pixel bubble.
const ART = [
  "...#####...#####...",
  "..#.....###.....#..",
  ".#...............#.",
  ".#..+........+...#.",
  "#..+++........+...#",
  "#...+...++...+....#",
  "#.................#",
  "#......#####......#",
  "#.....#.....#.....#",
  ".#...#.......#...#.",
  "..###.........###..",
] as const;

const PLANES = [
  { z: 8, near: 1, far: 0.2, phase: 0 },
  { z: 4, near: 0.82, far: 0.34, phase: 0 },
  { z: 0, near: 0.55, far: 0.55, phase: 0 },
  { z: -4, near: 0.82, far: 0.34, phase: 0.5 },
  { z: -8, near: 1, far: 0.2, phase: 0.5 },
];

const PIXELS = PLANES.flatMap((plane) =>
  ART.flatMap((row, y) =>
    [...row].flatMap((cell, x) =>
      cell === "#" || (cell === "+" && Math.abs(plane.z) === 8)
        ? [{ x: (x - 9) * 4, y: (y - 5) * 4, ...plane }]
        : [],
    ),
  ),
);

export function PixelController() {
  return (
    <div aria-hidden="true" className="dot-bubble text-primary" style={{ width: 88, height: 60 }}>
      <div className="dot-bubble-shell">
        {PIXELS.map((pixel) => (
          <span
            key={`${pixel.z}:${pixel.x}:${pixel.y}`}
            className="dot-bubble-pixel"
            style={{
              "--x": pixel.x,
              "--y": pixel.y,
              "--z": pixel.z,
              "--near": pixel.near,
              "--far": pixel.far,
              "--phase": pixel.phase,
              "--rest": pixel.phase === 0 ? pixel.near : pixel.far,
            } as CSSProperties}
          />
        ))}
      </div>
    </div>
  );
}
