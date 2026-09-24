import type { ReactNode } from "react";
import styles from "./geometry.module.css";

/**
 * Geometry puzzles for the timeout screen. Each generator draws its own figure
 * from the same numbers it asks about, so the picture is always to scale.
 */

export type Problem = {
  topic: string;
  prompt: ReactNode;
  /** Read aloud in place of the figure. */
  description: string;
  figure: ReactNode;
  answer: number;
  /** How far off a guess may be and still count; defaults to 0.01. */
  tolerance?: number;
  /** Shown after the input, e.g. "°" or "π". */
  unit?: string;
  hint: string;
  solution: string;
};

type Rng = () => number;
type Pt = readonly [number, number];

export const WIDTH = 400;
export const HEIGHT = 300;

const INK = "#0f172a";
const BLUE = "#2563eb";
const AMBER = "#d97706";
const ROSE = "#e11d48";
const EMERALD = "#059669";
const VIOLET = "#7c3aed";

/** A small seeded generator, so a problem is reproducible from its seed. */
function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const int = (rng: Rng, min: number, max: number) =>
  min + Math.floor(rng() * (max - min + 1));
const pick = <T,>(rng: Rng, items: readonly T[]) =>
  items[Math.floor(rng() * items.length)];
const rad = (degrees: number) => (degrees * Math.PI) / 180;
const fmt = (n: number) =>
  Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);

const add = (p: Pt, q: Pt): Pt => [p[0] + q[0], p[1] + q[1]];
const sub = (p: Pt, q: Pt): Pt => [p[0] - q[0], p[1] - q[1]];
const scale = (p: Pt, k: number): Pt => [p[0] * k, p[1] * k];
const mid = (p: Pt, q: Pt): Pt => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
const unit = (p: Pt): Pt => scale(p, 1 / Math.hypot(p[0], p[1]));
/** SVG angles run clockwise, because y points down. */
const polar = (center: Pt, r: number, degrees: number): Pt => [
  center[0] + r * Math.cos(rad(degrees)),
  center[1] + r * Math.sin(rad(degrees)),
];
const points = (list: readonly Pt[]) => list.map((p) => p.join(",")).join(" ");

/** Scale and centre raw coordinates into the figure, keeping proportions. */
function fit(raw: readonly Pt[], pad = 44) {
  const xs = raw.map((p) => p[0]);
  const ys = raw.map((p) => p[1]);
  const [minX, maxX] = [Math.min(...xs), Math.max(...xs)];
  const [minY, maxY] = [Math.min(...ys), Math.max(...ys)];
  const k = Math.min(
    (WIDTH - pad * 2) / (maxX - minX || 1),
    (HEIGHT - pad * 2) / (maxY - minY || 1),
  );
  const dx = (WIDTH - (maxX - minX) * k) / 2;
  const dy = (HEIGHT - (maxY - minY) * k) / 2;
  return (p: Pt): Pt => [dx + (p[0] - minX) * k, dy + (p[1] - minY) * k];
}

/** Where to put a side's label: off its midpoint, away from the shape. */
function beside(p: Pt, q: Pt, inside: Pt, offset = 18): Pt {
  const m = mid(p, q);
  const [dx, dy] = unit(sub(q, p));
  let n: Pt = [-dy, dx];
  const toInside = sub(inside, m);
  if (n[0] * toInside[0] + n[1] * toInside[1] > 0) n = scale(n, -1);
  return add(m, scale(n, offset));
}

const centroid = (list: readonly Pt[]): Pt =>
  scale(
    list.reduce((sum, p) => add(sum, p), [0, 0] as Pt),
    1 / list.length,
  );

function Label({
  at,
  children,
  color = INK,
  size = 16,
}: {
  at: Pt;
  children: ReactNode;
  color?: string;
  size?: number;
}) {
  return (
    <text
      x={at[0]}
      y={at[1]}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={size}
      fontWeight={600}
      fill={color}
      stroke="white"
      strokeWidth={4}
      strokeLinejoin="round"
      paintOrder="stroke"
      className={styles.fade}
    >
      {children}
    </text>
  );
}

function Dot({ at, color = INK }: { at: Pt; color?: string }) {
  return (
    <circle
      cx={at[0]}
      cy={at[1]}
      r={3.5}
      fill={color}
      className={styles.fade}
    />
  );
}

/** Marks the smaller angle at `at` between the rays towards `from` and `to`. */
function AngleArc({
  at,
  from,
  to,
  color,
  label,
  r = 26,
}: {
  at: Pt;
  from: Pt;
  to: Pt;
  color: string;
  label?: ReactNode;
  r?: number;
}) {
  const a1 = Math.atan2(from[1] - at[1], from[0] - at[0]);
  const a2 = Math.atan2(to[1] - at[1], to[0] - at[0]);
  let sweep = a2 - a1;
  while (sweep <= -Math.PI) sweep += Math.PI * 2;
  while (sweep > Math.PI) sweep -= Math.PI * 2;
  const p1: Pt = [at[0] + r * Math.cos(a1), at[1] + r * Math.sin(a1)];
  const p2: Pt = [at[0] + r * Math.cos(a2), at[1] + r * Math.sin(a2)];
  const flag = sweep > 0 ? 1 : 0;
  const bisector = a1 + sweep / 2;
  // Narrow angles push the label further out so it clears both rays.
  const reach = r + 12 + Math.max(0, 0.9 - Math.abs(sweep)) * 22;
  const labelAt: Pt = [
    at[0] + reach * Math.cos(bisector),
    at[1] + reach * Math.sin(bisector),
  ];
  return (
    <g className={styles.fade}>
      <path
        d={`M${at} L${p1} A${r} ${r} 0 0 ${flag} ${p2} Z`}
        fill={color}
        fillOpacity={0.16}
      />
      <path
        d={`M${p1} A${r} ${r} 0 0 ${flag} ${p2}`}
        fill="none"
        stroke={color}
        strokeWidth={2}
      />
      {label !== undefined && (
        <Label at={labelAt} color={color} size={15}>
          {label}
        </Label>
      )}
    </g>
  );
}

function RightAngle({ at, a, b }: { at: Pt; a: Pt; b: Pt }) {
  const u = scale(unit(sub(a, at)), 13);
  const v = scale(unit(sub(b, at)), 13);
  return (
    <path
      d={`M${add(at, u)} L${add(add(at, u), v)} L${add(at, v)}`}
      fill="none"
      stroke={INK}
      strokeWidth={1.5}
      className={styles.fade}
    />
  );
}

/** Paper, grid and gradients shared by every figure. */
export function FigureFrame({
  description,
  children,
}: {
  description: string;
  children: ReactNode;
}) {
  const fills = { blue: BLUE, amber: AMBER, rose: ROSE, emerald: EMERALD };
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={description}
      className="block h-auto w-full select-none"
      fontFamily="inherit"
    >
      <defs>
        <pattern
          id="geo-grid-minor"
          width={10}
          height={10}
          patternUnits="userSpaceOnUse"
        >
          <path d="M10 0H0V10" fill="none" stroke="#eef2f7" strokeWidth={1} />
        </pattern>
        <pattern
          id="geo-grid"
          width={50}
          height={50}
          patternUnits="userSpaceOnUse"
        >
          <rect width={50} height={50} fill="url(#geo-grid-minor)" />
          <path d="M50 0H0V50" fill="none" stroke="#e2e8f0" strokeWidth={1} />
        </pattern>
        {Object.entries(fills).map(([name, color]) => (
          <linearGradient
            key={name}
            id={`geo-${name}`}
            x1="0"
            y1="0"
            x2="1"
            y2="1"
          >
            <stop offset="0%" stopColor={color} stopOpacity={0.08} />
            <stop offset="100%" stopColor={color} stopOpacity={0.28} />
          </linearGradient>
        ))}
        <radialGradient id="geo-disc" cx="40%" cy="35%" r="75%">
          <stop offset="0%" stopColor="#eff6ff" />
          <stop offset="70%" stopColor="#bfdbfe" />
          <stop offset="100%" stopColor="#93c5fd" />
        </radialGradient>
      </defs>
      <rect width={WIDTH} height={HEIGHT} fill="url(#geo-grid)" />
      {children}
    </svg>
  );
}

function triangleAngles(rng: Rng): Problem {
  const a = int(rng, 40, 75);
  const b = Math.min(int(rng, 40, 75), 150 - a);
  const c = 180 - a - b;
  const apexReach = Math.sin(rad(b)) / Math.sin(rad(c));
  const map = fit([
    [0, 0],
    [1, 0],
    [apexReach * Math.cos(rad(a)), -apexReach * Math.sin(rad(a))],
  ]);
  const p = map([0, 0]);
  const q = map([1, 0]);
  const apex = map([
    apexReach * Math.cos(rad(a)),
    -apexReach * Math.sin(rad(a)),
  ]);
  return {
    topic: "Angles in a triangle",
    prompt: (
      <>
        Two angles of a triangle are {a}° and {b}°. What is the third angle?
      </>
    ),
    description: `A triangle with angles of ${a} and ${b} degrees marked, and the third angle unknown.`,
    figure: (
      <>
        <polygon
          points={points([p, q, apex])}
          fill="url(#geo-blue)"
          className={styles.fade}
        />
        <AngleArc at={p} from={q} to={apex} color={BLUE} label={`${a}°`} />
        <AngleArc at={q} from={apex} to={p} color={AMBER} label={`${b}°`} />
        <AngleArc at={apex} from={p} to={q} color={ROSE} label="?" r={22} />
        <polygon
          points={points([p, q, apex])}
          pathLength={1}
          fill="none"
          stroke={INK}
          strokeWidth={2.5}
          strokeLinejoin="round"
          className={styles.draw}
        />
      </>
    ),
    answer: c,
    unit: "°",
    hint: "The three angles of any triangle add up to 180°.",
    solution: `180° − ${a}° − ${b}° = ${c}°`,
  };
}

function pythagoras(rng: Rng): Problem {
  const triple = pick(rng, [
    [3, 4, 5],
    [6, 8, 10],
    [5, 12, 13],
    [8, 15, 17],
    [9, 12, 15],
    [12, 16, 20],
  ] as const);
  const [a, b] = rng() < 0.5 ? [triple[0], triple[1]] : [triple[1], triple[0]];
  const c = triple[2];
  const askHypotenuse = rng() < 0.6;

  // Right angle at the origin, legs along the axes, a square on every side.
  const r: Pt = [0, 0];
  const x: Pt = [a, 0];
  const y: Pt = [0, -b];
  const out: Pt = [b, -a];
  const squares = {
    a: [r, x, [a, a], [0, a]] as Pt[],
    b: [r, y, [-b, -b], [-b, 0]] as Pt[],
    c: [x, y, add(y, out), add(x, out)] as Pt[],
  };
  const map = fit([...squares.a, ...squares.b, ...squares.c], 18);
  const [R, X, Y] = [map(r), map(x), map(y)];
  const inside = centroid([R, X, Y]);
  const square = (list: Pt[], fill: string, stroke: string, area: string) => {
    const mapped = list.map(map);
    return (
      <g className={styles.fade}>
        <polygon
          points={points(mapped)}
          fill={fill}
          stroke={stroke}
          strokeOpacity={0.5}
          strokeWidth={1.5}
        />
        <Label at={centroid(mapped)} color={stroke} size={13}>
          {area}
        </Label>
      </g>
    );
  };

  return {
    topic: "Pythagorean theorem",
    prompt: askHypotenuse ? (
      <>
        A right triangle has legs of {a} and {b}. How long is the hypotenuse?
      </>
    ) : (
      <>
        A right triangle has a leg of {a} and a hypotenuse of {c}. How long is
        the other leg?
      </>
    ),
    description: `A right triangle with a square drawn on each side. ${
      askHypotenuse
        ? `The legs are ${a} and ${b}; the hypotenuse is unknown.`
        : `One leg is ${a} and the hypotenuse is ${c}; the other leg is unknown.`
    }`,
    figure: (
      <>
        {square(squares.a, "url(#geo-blue)", BLUE, `${a * a}`)}
        {square(
          squares.b,
          "url(#geo-amber)",
          AMBER,
          askHypotenuse ? `${b * b}` : "?",
        )}
        {square(
          squares.c,
          "url(#geo-rose)",
          ROSE,
          askHypotenuse ? "?" : `${c * c}`,
        )}
        <polygon
          points={points([R, X, Y])}
          fill="white"
          className={styles.fade}
        />
        <RightAngle at={R} a={X} b={Y} />
        <polygon
          points={points([R, X, Y])}
          pathLength={1}
          fill="none"
          stroke={INK}
          strokeWidth={2.5}
          strokeLinejoin="round"
          className={styles.draw}
        />
        <Label at={mid(R, X)} color={BLUE}>
          {a}
        </Label>
        <Label at={mid(R, Y)} color={AMBER}>
          {askHypotenuse ? b : "?"}
        </Label>
        <Label at={beside(X, Y, inside, 16)} color={ROSE}>
          {askHypotenuse ? "?" : c}
        </Label>
      </>
    ),
    answer: askHypotenuse ? c : b,
    hint: "The squares on the two legs add up to the square on the hypotenuse: a² + b² = c².",
    solution: askHypotenuse
      ? `√(${a}² + ${b}²) = √${a * a + b * b} = ${c}`
      : `√(${c}² − ${a}²) = √${c * c - a * a} = ${b}`,
  };
}

function circle(rng: Rng): Problem {
  const r = int(rng, 2, 9);
  const askArea = rng() < 0.5;
  const center: Pt = [WIDTH / 2, HEIGHT / 2];
  const R = 112;
  const edge = polar(center, R, -35);
  const slices = Array.from({ length: 12 }, (_, i) => polar(center, R, i * 30));
  return {
    topic: askArea ? "Area of a circle" : "Circumference",
    prompt: askArea ? (
      <>A circle has a radius of {r}. What is its area, as a multiple of π?</>
    ) : (
      <>
        A circle has a radius of {r}. What is its circumference, as a multiple
        of π?
      </>
    ),
    description: `A circle with its radius of ${r} marked.`,
    figure: (
      <>
        <circle
          cx={center[0]}
          cy={center[1]}
          r={R}
          fill="url(#geo-disc)"
          fillOpacity={askArea ? 1 : 0.45}
          className={styles.fade}
        />
        {askArea &&
          slices.map((p, i) => (
            <line
              key={i}
              x1={center[0]}
              y1={center[1]}
              x2={p[0]}
              y2={p[1]}
              stroke="white"
              strokeOpacity={0.7}
              strokeWidth={1.5}
              className={styles.fade}
            />
          ))}
        <circle
          cx={center[0]}
          cy={center[1]}
          r={R}
          pathLength={1}
          fill="none"
          stroke={askArea ? INK : ROSE}
          strokeWidth={askArea ? 2.5 : 5}
          className={styles.draw}
        />
        <line
          x1={center[0]}
          y1={center[1]}
          x2={edge[0]}
          y2={edge[1]}
          stroke={BLUE}
          strokeWidth={2.5}
          className={styles.fade}
        />
        <Dot at={center} />
        <Label at={add(mid(center, edge), [-6, -16])} color={BLUE}>
          r = {r}
        </Label>
        {!askArea && (
          <Label at={polar(center, R + 22, 135)} color={ROSE}>
            C = ?
          </Label>
        )}
      </>
    ),
    answer: askArea ? r * r : 2 * r,
    unit: "π",
    hint: askArea
      ? "Area is π times the radius squared: A = πr²."
      : "Circumference is 2π times the radius: C = 2πr.",
    solution: askArea ? `π × ${r}² = ${r * r}π` : `2 × π × ${r} = ${2 * r}π`,
  };
}

function inscribedAngle(rng: Rng): Problem {
  const central = 2 * int(rng, 30, 80);
  const inscribed = central / 2;
  const askInscribed = rng() < 0.6;
  const center: Pt = [WIDTH / 2, HEIGHT / 2 + 6];
  const R = 118;
  const a = polar(center, R, 90 - central / 2);
  const b = polar(center, R, 90 + central / 2);
  const p = polar(center, R, -90 + int(rng, -35, 35));
  return {
    topic: "Inscribed angles",
    prompt: askInscribed ? (
      <>The central angle AOB is {central}°. What is the inscribed angle APB?</>
    ) : (
      <>
        The inscribed angle APB is {inscribed}°. What is the central angle AOB?
      </>
    ),
    description: `A circle with centre O and points A, B and P on it. ${
      askInscribed
        ? `Angle AOB is ${central} degrees; angle APB is unknown.`
        : `Angle APB is ${inscribed} degrees; angle AOB is unknown.`
    }`,
    figure: (
      <>
        <circle
          cx={center[0]}
          cy={center[1]}
          r={R}
          fill="url(#geo-blue)"
          fillOpacity={0.5}
          className={styles.fade}
        />
        <circle
          cx={center[0]}
          cy={center[1]}
          r={R}
          pathLength={1}
          fill="none"
          stroke={INK}
          strokeWidth={2}
          className={styles.draw}
        />
        <path
          d={`M${a} A${R} ${R} 0 0 1 ${b}`}
          fill="none"
          stroke={EMERALD}
          strokeWidth={6}
          strokeLinecap="round"
          className={styles.fade}
        />
        <polyline
          points={points([a, center, b])}
          fill="none"
          stroke={BLUE}
          strokeWidth={2.5}
          strokeLinejoin="round"
          className={styles.fade}
        />
        <polyline
          points={points([a, p, b])}
          fill="none"
          stroke={AMBER}
          strokeWidth={2.5}
          strokeLinejoin="round"
          className={styles.fade}
        />
        <AngleArc
          at={center}
          from={a}
          to={b}
          color={BLUE}
          label={askInscribed ? `${central}°` : "?"}
          r={24}
        />
        <AngleArc
          at={p}
          from={a}
          to={b}
          color={AMBER}
          label={askInscribed ? "?" : `${inscribed}°`}
          r={30}
        />
        {[a, b, p, center].map((point, i) => (
          <Dot key={i} at={point} />
        ))}
        <Label at={polar(center, R + 16, 90 - central / 2)}>A</Label>
        <Label at={polar(center, R + 16, 90 + central / 2)}>B</Label>
        <Label at={add(p, [0, -16])}>P</Label>
        <Label at={add(center, [0, -18])}>O</Label>
      </>
    ),
    answer: askInscribed ? inscribed : central,
    unit: "°",
    hint: "An inscribed angle is half the central angle that stands on the same arc.",
    solution: askInscribed
      ? `${central}° ÷ 2 = ${inscribed}°`
      : `${inscribed}° × 2 = ${central}°`,
  };
}

const POLYGON_NAMES: Record<number, string> = {
  5: "pentagon",
  6: "hexagon",
  8: "octagon",
  9: "nonagon",
  10: "decagon",
  12: "dodecagon",
};

function polygonAngle(rng: Rng): Problem {
  const n = pick(rng, [5, 6, 8, 9, 10, 12] as const);
  const angle = (180 * (n - 2)) / n;
  const center: Pt = [WIDTH / 2, HEIGHT / 2 + 4];
  const R = 126;
  const start = -90 + (n % 2 === 0 ? 180 / n : 0);
  const corners = Array.from({ length: n }, (_, i) =>
    polar(center, R, start + (360 * i) / n),
  );
  const fills = ["url(#geo-blue)", "url(#geo-amber)", "url(#geo-emerald)"];
  return {
    topic: "Regular polygons",
    prompt: <>What is each interior angle of a regular {POLYGON_NAMES[n]}?</>,
    description: `A regular ${POLYGON_NAMES[n]} split into ${n - 2} triangles from one corner, with one interior angle unknown.`,
    figure: (
      <>
        {corners.slice(1, -1).map((corner, i) => (
          <polygon
            key={i}
            points={points([corners[0], corner, corners[i + 2]])}
            fill={fills[i % fills.length]}
            stroke="white"
            strokeWidth={1.5}
            className={styles.fade}
          />
        ))}
        <AngleArc
          at={corners[1]}
          from={corners[0]}
          to={corners[2]}
          color={ROSE}
          label="?"
          r={22}
        />
        <polygon
          points={points(corners)}
          pathLength={1}
          fill="none"
          stroke={INK}
          strokeWidth={2.5}
          strokeLinejoin="round"
          className={styles.draw}
        />
        <Dot at={corners[0]} color={VIOLET} />
      </>
    ),
    answer: angle,
    unit: "°",
    hint: `From one corner, a ${POLYGON_NAMES[n]} splits into ${n} − 2 triangles, each worth 180°.`,
    solution: `(${n} − 2) × 180° ÷ ${n} = ${angle}°`,
  };
}

type Corner = "upper right" | "upper left" | "lower left" | "lower right";

const RELATIONSHIPS = [
  {
    name: "Corresponding angles",
    rule: "Corresponding angles are equal",
    known: ["top", "upper right"],
    asked: ["bottom", "upper right"],
    supplementary: false,
  },
  {
    name: "Alternate interior angles",
    rule: "Alternate interior angles are equal",
    known: ["top", "lower right"],
    asked: ["bottom", "upper left"],
    supplementary: false,
  },
  {
    name: "Co-interior angles",
    rule: "Co-interior angles add up to 180°",
    known: ["top", "lower right"],
    asked: ["bottom", "upper right"],
    supplementary: true,
  },
  {
    name: "Vertical angles",
    rule: "Vertically opposite angles are equal",
    known: ["top", "upper right"],
    asked: ["top", "lower left"],
    supplementary: false,
  },
] as const;

function parallelLines(rng: Rng): Problem {
  let tilt = int(rng, 40, 140);
  if (Math.abs(tilt - 90) < 12) tilt += tilt < 90 ? -12 : 12;
  const relationship = pick(rng, RELATIONSHIPS);

  const up: Pt = [Math.cos(rad(tilt)), -Math.sin(rad(tilt))];
  const directions: Record<Corner, [Pt, Pt]> = {
    "upper right": [[1, 0], up],
    "upper left": [up, [-1, 0]],
    "lower left": [[-1, 0], scale(up, -1)],
    "lower right": [scale(up, -1), [1, 0]],
  };
  const value = (corner: Corner) =>
    corner === "upper right" || corner === "lower left" ? tilt : 180 - tilt;

  const [topY, bottomY] = [102, 208];
  const center: Pt = [WIDTH / 2, (topY + bottomY) / 2];
  const along = (bottomY - topY) / 2 / Math.sin(rad(tilt));
  const crossings = {
    top: add(center, scale(up, along)),
    bottom: add(center, scale(up, -along)),
  };
  const reach = 135 / Math.sin(rad(tilt));
  const ends = [add(center, scale(up, reach)), add(center, scale(up, -reach))];

  const arc = (
    [line, corner]: readonly ["top" | "bottom", Corner],
    label: string,
    color: string,
  ) => {
    const at = crossings[line];
    const [from, to] = directions[corner];
    return (
      <AngleArc
        at={at}
        from={add(at, scale(from, 40))}
        to={add(at, scale(to, 40))}
        color={color}
        label={label}
        r={24}
      />
    );
  };
  const known = value(relationship.known[1]);
  const answer = value(relationship.asked[1]);
  const chevron = (y: number) => (
    <path
      d={`M${316} ${y - 7} L${326} ${y} L${316} ${y + 7}`}
      fill="none"
      stroke={VIOLET}
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={styles.fade}
    />
  );

  return {
    topic: "Parallel lines",
    prompt: (
      <>
        The two violet lines are parallel. One angle is {known}°. What is the
        angle marked ?
      </>
    ),
    description: `Two parallel lines cut by a transversal. The ${relationship.known[1]} angle at the ${relationship.known[0]} crossing is ${known} degrees; the ${relationship.asked[1]} angle at the ${relationship.asked[0]} crossing is unknown.`,
    figure: (
      <>
        <rect
          x={24}
          y={topY}
          width={WIDTH - 48}
          height={bottomY - topY}
          fill="url(#geo-emerald)"
          fillOpacity={0.5}
          className={styles.fade}
        />
        {[topY, bottomY].map((y) => (
          <line
            key={y}
            x1={24}
            y1={y}
            x2={WIDTH - 24}
            y2={y}
            pathLength={1}
            stroke={VIOLET}
            strokeWidth={3}
            strokeLinecap="round"
            className={styles.draw}
          />
        ))}
        {chevron(topY)}
        {chevron(bottomY)}
        <line
          x1={ends[0][0]}
          y1={ends[0][1]}
          x2={ends[1][0]}
          y2={ends[1][1]}
          pathLength={1}
          stroke={INK}
          strokeWidth={2.5}
          strokeLinecap="round"
          className={styles.draw}
        />
        {arc(relationship.known, `${known}°`, BLUE)}
        {arc(relationship.asked, "?", ROSE)}
        <Dot at={crossings.top} />
        <Dot at={crossings.bottom} />
      </>
    ),
    answer,
    unit: "°",
    hint: `${relationship.name}: ${relationship.rule.toLowerCase()}.`,
    solution: relationship.supplementary
      ? `180° − ${known}° = ${answer}°`
      : `${relationship.rule}, so ? = ${answer}°`,
  };
}

function trapezoid(rng: Rng): Problem {
  const top = int(rng, 4, 10);
  const base = top + int(rng, 2, 6);
  let height = int(rng, 3, 8);
  if (((top + base) * height) % 2 === 1) height += 1;
  const area = ((top + base) * height) / 2;
  const offset = (base - top) * (0.25 + rng() * 0.5);

  const raw: Pt[] = [
    [0, 0],
    [base, 0],
    [offset + top, -height],
    [offset, -height],
  ];
  const map = fit(raw, 48);
  const [bl, br, tr, tl] = raw.map(map);
  const foot: Pt = [tl[0], bl[1]];
  const inside = centroid([bl, br, tr, tl]);
  return {
    topic: "Area of a trapezoid",
    prompt: (
      <>
        A trapezoid has parallel sides of {top} and {base} and a height of{" "}
        {height}. What is its area?
      </>
    ),
    description: `A trapezoid with parallel sides ${top} and ${base} and height ${height}.`,
    figure: (
      <>
        <polygon
          points={points([bl, br, tr, tl])}
          fill="url(#geo-emerald)"
          className={styles.fade}
        />
        <line
          x1={tl[0]}
          y1={tl[1]}
          x2={foot[0]}
          y2={foot[1]}
          stroke={AMBER}
          strokeWidth={2}
          strokeDasharray="6 5"
          className={styles.fade}
        />
        <RightAngle at={foot} a={br} b={tl} />
        <polygon
          points={points([bl, br, tr, tl])}
          pathLength={1}
          fill="none"
          stroke={INK}
          strokeWidth={2.5}
          strokeLinejoin="round"
          className={styles.draw}
        />
        <Label at={beside(tl, tr, inside)} color={BLUE}>
          {top}
        </Label>
        <Label at={beside(bl, br, inside)} color={BLUE}>
          {base}
        </Label>
        <Label at={add(mid(tl, foot), [14, 0])} color={AMBER}>
          {height}
        </Label>
        <Label at={add(inside, [16, 10])} color={EMERALD} size={20}>
          ?
        </Label>
      </>
    ),
    answer: area,
    unit: "units²",
    hint: "Average the two parallel sides, then multiply by the height.",
    solution: `(${top} + ${base}) ÷ 2 × ${height} = ${area}`,
  };
}

/** Places a triangle from its three side lengths, base first. */
function fromSides(base: number, left: number, right: number): Pt[] {
  const x = (base * base + left * left - right * right) / (2 * base);
  return [
    [0, 0],
    [base, 0],
    [x, -Math.sqrt(left * left - x * x)],
  ];
}

function similarTriangles(rng: Rng): Problem {
  const [base, left, right] = pick(rng, [
    [4, 6, 7],
    [3, 5, 6],
    [5, 6, 8],
    [4, 5, 7],
    [6, 4, 5],
  ] as const);
  const k = pick(rng, [1.5, 2, 2.5, 3] as const);
  const small = fromSides(base, left, right);
  const gap = base * 0.9;
  const big = small.map((p) => add(scale(p, k), [base + gap, 0]));
  const map = fit([...small, ...big], 30);
  const s = small.map(map);
  const g = big.map(map);
  const sides = (tri: Pt[], labels: [ReactNode, ReactNode]) => {
    const inside = centroid(tri);
    return (
      <>
        <polygon
          points={points(tri)}
          fill="url(#geo-rose)"
          fillOpacity={0.7}
          className={styles.fade}
        />
        <line
          x1={tri[0][0]}
          y1={tri[0][1]}
          x2={tri[1][0]}
          y2={tri[1][1]}
          stroke={BLUE}
          strokeWidth={4}
          strokeLinecap="round"
          className={styles.fade}
        />
        <line
          x1={tri[0][0]}
          y1={tri[0][1]}
          x2={tri[2][0]}
          y2={tri[2][1]}
          stroke={AMBER}
          strokeWidth={4}
          strokeLinecap="round"
          className={styles.fade}
        />
        <polygon
          points={points(tri)}
          pathLength={1}
          fill="none"
          stroke={INK}
          strokeWidth={1.5}
          strokeLinejoin="round"
          className={styles.draw}
        />
        <Label at={beside(tri[0], tri[1], inside)} color={BLUE}>
          {labels[0]}
        </Label>
        <Label at={beside(tri[0], tri[2], inside)} color={AMBER}>
          {labels[1]}
        </Label>
      </>
    );
  };
  return {
    topic: "Similar triangles",
    prompt: (
      <>
        These triangles are similar. The small one has sides of {base} and{" "}
        {left}; the matching base on the large one is {fmt(base * k)}. How long
        is the side marked ?
      </>
    ),
    description: `Two similar triangles. The small one has a ${base} base and a ${left} side; the large one has a ${fmt(base * k)} base and an unknown matching side.`,
    figure: (
      <>
        {sides(s, [base, left])}
        {sides(g, [fmt(base * k), "?"])}
      </>
    ),
    answer: left * k,
    hint: "Similar shapes grow by one scale factor. Compare the two blue bases to find it.",
    solution: `${fmt(base * k)} ÷ ${base} = ${k}, and ${left} × ${k} = ${fmt(left * k)}`,
  };
}

function shadedCorners(rng: Rng): Problem {
  const side = 2 * int(rng, 2, 7);
  const r = side / 2;
  const exact = side * side - Math.PI * r * r;
  const answer = Math.round(exact * 10) / 10;
  const size = 200;
  const [x, y] = [(WIDTH - size) / 2, (HEIGHT - size) / 2];
  const center: Pt = [WIDTH / 2, HEIGHT / 2];
  const R = size / 2;
  const edge = polar(center, R, -40);
  return {
    topic: "Shaded area",
    prompt: (
      <>
        A circle fits exactly inside a square with sides of {side}. What is the
        shaded area, to the nearest tenth?
      </>
    ),
    description: `A circle inscribed in a square with side ${side}. The four corners outside the circle are shaded.`,
    figure: (
      <>
        <path
          d={`M${x} ${y}h${size}v${size}h${-size}Z M${center[0] - R} ${center[1]} a${R} ${R} 0 1 0 ${size} 0 a${R} ${R} 0 1 0 ${-size} 0Z`}
          fillRule="evenodd"
          fill={ROSE}
          fillOpacity={0.3}
          className={styles.fade}
        />
        <rect
          x={x}
          y={y}
          width={size}
          height={size}
          pathLength={1}
          fill="none"
          stroke={INK}
          strokeWidth={2.5}
          className={styles.draw}
        />
        <circle
          cx={center[0]}
          cy={center[1]}
          r={R}
          pathLength={1}
          fill="none"
          stroke={ROSE}
          strokeWidth={2.5}
          className={styles.draw}
        />
        <line
          x1={center[0]}
          y1={center[1]}
          x2={edge[0]}
          y2={edge[1]}
          stroke={BLUE}
          strokeWidth={2}
          strokeDasharray="5 4"
          className={styles.fade}
        />
        <Dot at={center} />
        <Label at={[center[0], y + size + 18]} color={INK}>
          {side}
        </Label>
        {(
          [
            [x + 18, y + 18],
            [x + size - 18, y + 18],
            [x + 18, y + size - 18],
            [x + size - 18, y + size - 18],
          ] satisfies Pt[]
        ).map((at, i) => (
          <Label key={i} at={at} color={ROSE} size={13}>
            ?
          </Label>
        ))}
      </>
    ),
    answer,
    tolerance: Math.max(0.1, answer * 0.006),
    unit: "units²",
    hint: "Take the circle away from the square. The circle's radius is half the side.",
    solution: `${side}² − π × ${fmt(r)}² ≈ ${side * side} − ${fmt(Math.PI * r * r)} ≈ ${answer}`,
  };
}

export const GENERATORS = [
  triangleAngles,
  pythagoras,
  circle,
  inscribedAngle,
  polygonAngle,
  parallelLines,
  trapezoid,
  similarTriangles,
  shadedCorners,
] as const;

export function makeProblem(kind: number, seed: number): Problem {
  return GENERATORS[kind % GENERATORS.length](mulberry32(seed));
}
