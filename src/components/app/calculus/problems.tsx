import type { ReactNode } from "react";
import type { PuzzleParams } from "@convex/calculus";
import {
  eulerRule,
  expo,
  fmt,
  poly,
  polyAt,
  power,
  sup,
  terms,
  withConstant,
} from "@/lib/calculus-text";
import styles from "./calculus.module.css";

/**
 * The timeout-screen calculus problems, as the browser shows them. The server
 * picks the givens and keeps the answer (see `convex/calculus.ts`); this
 * draws the figure from those givens, to scale, and words the question.
 *
 * A figure never gives its answer away: where a graph would show the value
 * being asked for (a limit, a sum), it shows the ingredients instead.
 */

export type Problem = {
  topic: string;
  prompt: ReactNode;
  /** Read aloud in place of the figure. */
  description: string;
  figure: ReactNode;
  /** Shown after the input, e.g. "π". */
  unit?: string;
  hint: string;
};

type Pt = readonly [number, number];
type Params<Kind extends PuzzleParams["kind"]> = Extract<
  PuzzleParams,
  { kind: Kind }
>;

export const WIDTH = 400;
export const HEIGHT = 300;

const INK = "#0f172a";
const BLUE = "#2563eb";
const AMBER = "#d97706";
const ROSE = "#e11d48";
const EMERALD = "#059669";
const VIOLET = "#7c3aed";
const AXIS = "#64748b";

const DECIMALS = "Give your answer to three decimal places.";

/** Maps graph coordinates into the figure. SVG's y runs downwards. */
type Frame = {
  x: (x: number) => number;
  y: (y: number) => number;
  xs: readonly [number, number];
  ys: readonly [number, number];
};

function frame(
  xs: readonly [number, number],
  ys: readonly [number, number],
  pad = 36,
): Frame {
  const kx = (WIDTH - pad * 2) / (xs[1] - xs[0]);
  const ky = (HEIGHT - pad * 2) / (ys[1] - ys[0]);
  return {
    x: (x) => pad + (x - xs[0]) * kx,
    y: (y) => HEIGHT - pad - (y - ys[0]) * ky,
    xs,
    ys,
  };
}

/** A y-range that fits every sample, padded, and includes zero. */
function span(values: readonly number[], pad = 0.15): [number, number] {
  const finite = values.filter(Number.isFinite);
  let lo = Math.min(0, ...finite);
  let hi = Math.max(0, ...finite);
  const room = (hi - lo || 1) * pad;
  lo -= room;
  hi += room;
  return [lo, hi];
}

function samples(f: (x: number) => number, from: number, to: number, n = 160) {
  return Array.from({ length: n + 1 }, (_, i) => {
    const x = from + ((to - from) * i) / n;
    return [x, f(x)] as Pt;
  });
}

/** A step for tick marks that gives roughly six of them. */
function tickStep(range: number) {
  const raw = range / 6;
  const power = 10 ** Math.floor(Math.log10(raw));
  const candidates = [1, 2, 2.5, 5, 10].map((k) => k * power);
  return candidates.find((c) => c >= raw) ?? candidates[candidates.length - 1];
}

function ticks(from: number, to: number, step: number) {
  const out: number[] = [];
  for (let v = Math.ceil(from / step) * step; v <= to + 1e-9; v += step)
    out.push(Math.abs(v) < 1e-9 ? 0 : v);
  return out;
}

function Label({
  at,
  children,
  color = INK,
  size = 15,
  anchor = "middle",
}: {
  at: Pt;
  children: ReactNode;
  color?: string;
  size?: number;
  anchor?: "start" | "middle" | "end";
}) {
  return (
    <text
      x={at[0]}
      y={at[1]}
      textAnchor={anchor}
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

function Dot({
  at,
  color = INK,
  hollow = false,
}: {
  at: Pt;
  color?: string;
  hollow?: boolean;
}) {
  return (
    <circle
      cx={at[0]}
      cy={at[1]}
      r={4}
      fill={hollow ? "white" : color}
      stroke={color}
      strokeWidth={2}
      className={styles.fade}
    />
  );
}

/** Axes with ticks, labelled every step. Only the axes inside the frame. */
function Axes({
  frame: fr,
  xName = "x",
  yName = "y",
  xStep,
  yStep,
}: {
  frame: Frame;
  xName?: string;
  yName?: string;
  xStep?: number;
  yStep?: number;
}) {
  const sx = xStep ?? tickStep(fr.xs[1] - fr.xs[0]);
  const sy = yStep ?? tickStep(fr.ys[1] - fr.ys[0]);
  const x0 = Math.min(Math.max(0, fr.xs[0]), fr.xs[1]);
  const y0 = Math.min(Math.max(0, fr.ys[0]), fr.ys[1]);
  const tickText = (v: number) => fmt(Math.round(v * 1000) / 1000);
  return (
    <g className={styles.fade} fontSize={11} fill={AXIS}>
      {ticks(fr.xs[0], fr.xs[1], sx).map((v) => (
        <g key={`x${v}`}>
          <line
            x1={fr.x(v)}
            y1={fr.y(fr.ys[0])}
            x2={fr.x(v)}
            y2={fr.y(fr.ys[1])}
            stroke="#cbd5e1"
            strokeWidth={0.75}
          />
          {v !== 0 && (
            <text x={fr.x(v)} y={fr.y(y0) + 12} textAnchor="middle">
              {tickText(v)}
            </text>
          )}
        </g>
      ))}
      {ticks(fr.ys[0], fr.ys[1], sy).map((v) => (
        <g key={`y${v}`}>
          <line
            x1={fr.x(fr.xs[0])}
            y1={fr.y(v)}
            x2={fr.x(fr.xs[1])}
            y2={fr.y(v)}
            stroke="#cbd5e1"
            strokeWidth={0.75}
          />
          {v !== 0 && (
            <text
              x={fr.x(x0) - 5}
              y={fr.y(v)}
              textAnchor="end"
              dominantBaseline="central"
            >
              {tickText(v)}
            </text>
          )}
        </g>
      ))}
      <line
        x1={fr.x(fr.xs[0])}
        y1={fr.y(y0)}
        x2={fr.x(fr.xs[1])}
        y2={fr.y(y0)}
        stroke={AXIS}
        strokeWidth={1.5}
      />
      <line
        x1={fr.x(x0)}
        y1={fr.y(fr.ys[0])}
        x2={fr.x(x0)}
        y2={fr.y(fr.ys[1])}
        stroke={AXIS}
        strokeWidth={1.5}
      />
      <text x={fr.x(fr.xs[1]) + 4} y={fr.y(y0)} dominantBaseline="central">
        {xName}
      </text>
      <text x={fr.x(x0)} y={fr.y(fr.ys[1]) - 8} textAnchor="middle">
        {yName}
      </text>
    </g>
  );
}

const path = (fr: Frame, pts: readonly Pt[]) =>
  pts
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${fr.x(x)} ${fr.y(y)}`)
    .join(" ");

/** A sampled curve, traced in. Off-frame parts are clipped by the frame. */
function Curve({
  frame: fr,
  points,
  color,
  width = 2.5,
  dashed = false,
}: {
  frame: Frame;
  points: readonly Pt[];
  color: string;
  width?: number;
  dashed?: boolean;
}) {
  const inside = points.filter(
    ([, y]) => Number.isFinite(y) && y > fr.ys[0] - 50 && y < fr.ys[1] + 50,
  );
  return (
    <path
      d={path(fr, inside)}
      pathLength={dashed ? undefined : 1}
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeLinejoin="round"
      strokeLinecap="round"
      strokeDasharray={dashed ? "6 5" : undefined}
      clipPath="url(#calc-clip)"
      className={dashed ? styles.fade : styles.draw}
    />
  );
}

/** The region between two sampled curves over the same x values. */
function Region({
  frame: fr,
  top,
  bottom,
  fill,
}: {
  frame: Frame;
  top: readonly Pt[];
  bottom: readonly Pt[];
  fill: string;
}) {
  const back = [...bottom].reverse();
  return (
    <path
      d={`${path(fr, top)} ${path(fr, back).replace("M", "L")} Z`}
      fill={fill}
      clipPath="url(#calc-clip)"
      className={styles.fade}
    />
  );
}

/** Paper, grid, clip and gradients shared by every figure. */
export function FigureFrame({
  description,
  children,
}: {
  description: string;
  children?: ReactNode;
}) {
  const fills = {
    blue: BLUE,
    amber: AMBER,
    rose: ROSE,
    emerald: EMERALD,
    violet: VIOLET,
  };
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
          id="calc-grid-minor"
          width={10}
          height={10}
          patternUnits="userSpaceOnUse"
        >
          <path d="M10 0H0V10" fill="none" stroke="#eef2f7" strokeWidth={1} />
        </pattern>
        <pattern
          id="calc-grid"
          width={50}
          height={50}
          patternUnits="userSpaceOnUse"
        >
          <rect width={50} height={50} fill="url(#calc-grid-minor)" />
          <path d="M50 0H0V50" fill="none" stroke="#e2e8f0" strokeWidth={1} />
        </pattern>
        <clipPath id="calc-clip">
          <rect x={8} y={8} width={WIDTH - 16} height={HEIGHT - 16} />
        </clipPath>
        {Object.entries(fills).map(([name, color]) => (
          <marker
            key={`arrow-${name}`}
            id={`calc-arrow-${name}`}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M0 0L10 5L0 10Z" fill={color} />
          </marker>
        ))}
        {Object.entries(fills).map(([name, color]) => (
          <linearGradient
            key={name}
            id={`calc-${name}`}
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop offset="0%" stopColor={color} stopOpacity={0.34} />
            <stop offset="100%" stopColor={color} stopOpacity={0.12} />
          </linearGradient>
        ))}
      </defs>
      <rect width={WIDTH} height={HEIGHT} fill="url(#calc-grid)" />
      {children}
    </svg>
  );
}

/** The segments of the level set F(x, y) = 0 inside a frame. */
function contour(
  fr: Frame,
  F: (x: number, y: number) => number,
  cells = 72,
): [Pt, Pt][] {
  const [x0, x1] = fr.xs;
  const [y0, y1] = fr.ys;
  const rows = Math.round((cells * (y1 - y0)) / (x1 - x0));
  const dx = (x1 - x0) / cells;
  const dy = (y1 - y0) / rows;
  const values: number[][] = [];
  for (let j = 0; j <= rows; j++) {
    values.push([]);
    for (let i = 0; i <= cells; i++)
      values[j].push(F(x0 + i * dx, y0 + j * dy));
  }
  const segments: [Pt, Pt][] = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cells; i++) {
      const corners: [Pt, number][] = [
        [[x0 + i * dx, y0 + j * dy], values[j][i]],
        [[x0 + (i + 1) * dx, y0 + j * dy], values[j][i + 1]],
        [[x0 + (i + 1) * dx, y0 + (j + 1) * dy], values[j + 1][i + 1]],
        [[x0 + i * dx, y0 + (j + 1) * dy], values[j + 1][i]],
      ];
      const crossings: Pt[] = [];
      for (let k = 0; k < 4; k++) {
        const [p, fp] = corners[k];
        const [q, fq] = corners[(k + 1) % 4];
        if (fp < 0 === fq < 0) continue;
        const t = fp / (fp - fq);
        crossings.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
      if (crossings.length === 2) segments.push([crossings[0], crossings[1]]);
      else if (crossings.length === 4) {
        segments.push([crossings[0], crossings[1]]);
        segments.push([crossings[2], crossings[3]]);
      }
    }
  }
  return segments;
}

function Contour({
  frame: fr,
  F,
  color,
}: {
  frame: Frame;
  F: (x: number, y: number) => number;
  color: string;
}) {
  const d = contour(fr, F)
    .map(([p, q]) => `M${fr.x(p[0])} ${fr.y(p[1])}L${fr.x(q[0])} ${fr.y(q[1])}`)
    .join("");
  return (
    <path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={2.5}
      strokeLinecap="round"
      clipPath="url(#calc-clip)"
      className={styles.fade}
    />
  );
}

/** A small table of values, drawn into the figure. */
function Table({
  head,
  rows,
}: {
  head: readonly string[];
  rows: readonly (readonly [string, readonly number[]])[];
}) {
  const left = 60;
  const top = 58;
  const rowH = 36;
  const colW = (WIDTH - left * 2) / (head.length + 1);
  const cell = (c: number) => left + colW * (c + 0.5);
  return (
    <g className={styles.fade}>
      <rect
        x={left}
        y={top}
        width={WIDTH - left * 2}
        height={rowH * (rows.length + 1)}
        rx={10}
        fill="white"
        stroke="#e2e8f0"
      />
      <rect
        x={left}
        y={top}
        width={WIDTH - left * 2}
        height={rowH}
        rx={10}
        fill="#f1f5f9"
      />
      <rect
        x={left}
        y={top + rowH - 10}
        width={WIDTH - left * 2}
        height={10}
        fill="#f1f5f9"
      />
      <text
        x={cell(0)}
        y={top + rowH / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={15}
        fontWeight={600}
        fill={AXIS}
      >
        x
      </text>
      {head.map((h, c) => (
        <text
          key={h}
          x={cell(c + 1)}
          y={top + rowH / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={15}
          fontWeight={600}
          fill={AXIS}
        >
          {h}
        </text>
      ))}
      {rows.map(([name, values], r) => (
        <g key={name}>
          <line
            x1={left}
            y1={top + rowH * (r + 1)}
            x2={WIDTH - left}
            y2={top + rowH * (r + 1)}
            stroke="#e2e8f0"
          />
          <text
            x={cell(0)}
            y={top + rowH * (r + 1.5)}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={15}
            fontWeight={600}
            fill={INK}
          >
            {name}
          </text>
          {values.map((value, c) => (
            <text
              key={c}
              x={cell(c + 1)}
              y={top + rowH * (r + 1.5)}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={15}
              fill={INK}
            >
              {fmt(value)}
            </text>
          ))}
        </g>
      ))}
    </g>
  );
}

/* ------------------------------------------------------------------------ */

function areaBetween({ r1, r2, r3, m, b }: Params<"area">): Problem {
  const difference = [
    -r1 * r2 * r3,
    r1 * r2 + r1 * r3 + r2 * r3,
    -(r1 + r2 + r3),
    1,
  ];
  const f = [difference[0] + b, difference[1] + m, difference[2], 1];
  const g = [b, m];
  const [lo, hi] = [r1 - 1, r3 + 1];
  const fPts = samples((x) => polyAt(f, x), lo, hi);
  const gPts = samples((x) => polyAt(g, x), lo, hi);
  const fr = frame(
    [lo, hi],
    span(
      [...fPts, ...gPts].map((p) => p[1]),
      0.1,
    ),
  );
  const between = (from: number, to: number, fill: string) => (
    <Region
      frame={fr}
      top={samples((x) => polyAt(f, x), from, to, 60)}
      bottom={samples((x) => polyAt(g, x), from, to, 60)}
      fill={fill}
    />
  );
  return {
    topic: "Area between curves",
    prompt: (
      <>
        Let f(x) = {poly(f)} and g(x) = {poly(g)}. Find the total area of the
        regions enclosed by the graphs of f and g.
      </>
    ),
    description: `The graphs of the cubic f(x) = ${poly(f)} and the line g(x) = ${poly(g)}, which cross three times. The two regions between them are shaded.`,
    figure: (
      <>
        <Axes frame={fr} />
        {between(r1, r2, "url(#calc-blue)")}
        {between(r2, r3, "url(#calc-rose)")}
        <Curve frame={fr} points={gPts} color={AMBER} />
        <Curve frame={fr} points={fPts} color={BLUE} />
        {[r1, r2, r3].map((r) => (
          <Dot key={r} at={[fr.x(r), fr.y(polyAt(g, r))]} />
        ))}
        <Label at={[fr.x(hi) - 14, fr.y(polyAt(f, hi)) + 16]} color={BLUE}>
          f
        </Label>
        <Label at={[fr.x(hi) - 14, fr.y(polyAt(g, hi)) - 16]} color={AMBER}>
          g
        </Label>
      </>
    ),
    hint: "Find where f − g is zero, then integrate |f − g| piece by piece: the sign flips between lobes, so a single integral cancels one against the other.",
  };
}

function volumeWashers({ a, axis }: Params<"volume">): Problem {
  const lo = -0.4;
  const hi = a + 0.4;
  const line = samples((x) => a * x, 0, a, 2);
  const parabola = samples((x) => x * x, 0, a, 60);
  const fr = frame([lo, hi], span([axis, a * a, 0], 0.14));
  return {
    topic: "Volumes by washers",
    prompt: (
      <>
        The region bounded by y = {terms([[a, "x"]])} and y = x² is revolved
        about the line y = {fmt(axis)}. Find the volume of the solid, as a
        multiple of π.
      </>
    ),
    description: `The region between the line y = ${terms([[a, "x"]])} and the parabola y = x², from x = 0 to x = ${fmt(a)}, with the dashed line y = ${fmt(axis)} it is revolved about.`,
    figure: (
      <>
        <Axes frame={fr} />
        <Region
          frame={fr}
          top={samples((x) => a * x, 0, a, 60)}
          bottom={parabola}
          fill="url(#calc-blue)"
        />
        <Curve
          frame={fr}
          points={[
            [lo, axis],
            [hi, axis],
          ]}
          color={ROSE}
          dashed
        />
        <Curve frame={fr} points={line} color={AMBER} />
        <Curve frame={fr} points={parabola} color={BLUE} />
        <Label at={[fr.x(hi) - 36, fr.y(axis) - 12]} color={ROSE} size={13}>
          y = {fmt(axis)}
        </Label>
        <Label at={[fr.x(a / 2) - 22, fr.y((a * a) / 2)]} color={AMBER}>
          y = {terms([[a, "x"]])}
        </Label>
        <Label at={[fr.x(a) + 22, fr.y((a * a) / 2)]} color={BLUE}>
          y = x²
        </Label>
      </>
    ),
    unit: "π",
    hint: `Each washer's radii are measured from y = ${fmt(axis)}, not from the x-axis: R(x) and r(x) are the distances from the axis to the two curves.`,
  };
}

function accumulation({ ys, a, b, c }: Params<"ftc">): Problem {
  const n = ys.length - 1;
  const fr = frame([-0.4, n + 0.4], [-3.6, 3.6]);
  const pts = ys.map((y, i) => [i, y] as Pt);
  const marks = a === b ? [a] : [a, b];
  return {
    topic: "Accumulation from a graph",
    prompt: (
      <>
        The graph of f′, the derivative of f, is shown for 0 ≤ x ≤ {n}; it is
        made of line segments through the marked points. Given that f({a}) ={" "}
        {fmt(c)}, find f({b}).
      </>
    ),
    description: `The graph of f′ on [0, ${n}], a polyline through the points ${ys.map((y, i) => `(${i}, ${fmt(y)})`).join(", ")}. The lines x = ${a} and x = ${b} are marked.`,
    figure: (
      <>
        <Axes frame={fr} xStep={1} yStep={1} />
        {marks.map((x) => (
          <Curve
            key={x}
            frame={fr}
            points={[
              [x, -3.6],
              [x, 3.6],
            ]}
            color={VIOLET}
            width={1.5}
            dashed
          />
        ))}
        <Region
          frame={fr}
          top={pts}
          bottom={pts.map(([x]) => [x, 0] as Pt)}
          fill="url(#calc-emerald)"
        />
        <Curve frame={fr} points={pts} color={EMERALD} />
        {pts.map((p) => (
          <Dot key={p[0]} at={[fr.x(p[0]), fr.y(p[1])]} color={EMERALD} />
        ))}
        {marks.map((x) => (
          <Label
            key={x}
            at={[fr.x(x), fr.y(3.6) + 12]}
            color={VIOLET}
            size={12}
          >
            x = {x}
          </Label>
        ))}
        <Label at={[fr.x(n) - 30, fr.y(-3.1)]} color={EMERALD}>
          y = f′(x)
        </Label>
      </>
    ),
    hint: "f(b) − f(a) is the signed area under f′ from a to b. Count the trapezoids square by square, and watch the direction if b is left of a.",
  };
}

function particleMotion({ r1, r2, end, sign, ask }: Params<"motion">): Problem {
  const velocity = [0, sign * r1 * r2, -sign * (r1 + r2), sign];
  const v = (t: number) => polyAt(velocity, t);
  const pts = samples(v, 0, end);
  const fr = frame(
    [-0.3, end + 0.3],
    span(
      pts.map((p) => p[1]),
      0.12,
    ),
  );
  const piece = (from: number, to: number) => {
    const positive = v((from + to) / 2) > 0;
    return (
      <Region
        key={from}
        frame={fr}
        top={samples(v, from, to, 40)}
        bottom={samples(() => 0, from, to, 40)}
        fill={positive ? "url(#calc-emerald)" : "url(#calc-rose)"}
      />
    );
  };
  return {
    topic: "Particle motion",
    prompt: (
      <>
        A particle moves along a line with velocity v(t) = {poly(velocity, "t")}{" "}
        for 0 ≤ t ≤ {end}.{" "}
        {ask === "distance"
          ? "Find the total distance it travels."
          : `Find its displacement from t = 0 to t = ${end}.`}
      </>
    ),
    description: `The graph of the velocity v(t) = ${poly(velocity, "t")} on [0, ${end}], crossing the axis at t = ${r1} and t = ${r2}, with the area above the axis shaded green and the area below shaded red.`,
    figure: (
      <>
        <Axes frame={fr} xName="t" yName="v" xStep={1} />
        {piece(0, r1)}
        {piece(r1, r2)}
        {piece(r2, end)}
        <Curve frame={fr} points={pts} color={BLUE} />
        {[r1, r2].map((t) => (
          <Dot key={t} at={[fr.x(t), fr.y(0)]} />
        ))}
      </>
    ),
    hint:
      ask === "distance"
        ? "Distance is ∫|v|: integrate separately on each interval where v keeps its sign, then add the absolute values."
        : "Displacement is just ∫v from 0 to the end, signs and all.",
  };
}

function implicitCurve(params: Params<"implicit">): Problem {
  const { x0, y0 } = params;
  const reach = Math.max(Math.abs(x0), Math.abs(y0)) + 3;
  const fr = frame([-reach, reach], [-reach * 0.75, reach * 0.75]);
  const point: Pt = [fr.x(x0), fr.y(y0)];
  const at = `(${fmt(x0)}, ${fmt(y0)})`;
  if (params.mode === "slope") {
    const { a } = params;
    const c = x0 ** 3 + y0 ** 3 - a * x0 * y0;
    const equation = `x³ + y³ = ${withConstant(terms([[a, "xy"]]), c)}`;
    return {
      topic: "Implicit differentiation",
      prompt: (
        <>
          The curve {equation} passes through {at}. Find dy/dx at that point.
        </>
      ),
      description: `The curve ${equation} with the point ${at} marked on it.`,
      figure: (
        <>
          <Axes frame={fr} />
          <Contour
            frame={fr}
            F={(x, y) => x ** 3 + y ** 3 - a * x * y - c}
            color={BLUE}
          />
          <Dot at={point} color={ROSE} />
          <Label at={[point[0] + 4, point[1] - 16]} color={ROSE} size={13}>
            {at}
          </Label>
        </>
      ),
      hint: "Differentiate every term with respect to x, remembering y′ on each y and the product rule on xy, then solve for y′ and substitute the point.",
    };
  }
  const { b } = params;
  const c = x0 * x0 + b * y0 * y0;
  const equation = `x² + ${terms([[b, "y²"]])} = ${fmt(c)}`;
  return {
    topic: "Implicit second derivative",
    prompt: (
      <>
        The curve {equation} passes through {at}. Find d²y/dx² at that point.
      </>
    ),
    description: `The ellipse ${equation} with the point ${at} marked on it.`,
    figure: (
      <>
        <Axes frame={fr} />
        <Contour frame={fr} F={(x, y) => x * x + b * y * y - c} color={BLUE} />
        <Dot at={point} color={ROSE} />
        <Label at={[point[0] + 4, point[1] - 16]} color={ROSE} size={13}>
          {at}
        </Label>
      </>
    ),
    hint: "Find y′ first, then differentiate y′ again with the quotient rule and substitute y′ back in. The original equation simplifies the numerator.",
  };
}

function seriesProblem(params: Params<"series">): Problem {
  switch (params.form) {
    case "xe": {
      const { p, q, n } = params;
      const f = (x: number) => x ** p * Math.exp(q * x);
      const fx = `${power("x", p)}·${expo(q)}`;
      const pts = samples(f, -1.2, 1.2);
      const [lo, hi] = span(
        pts.map((pt) => pt[1]),
        0.12,
      );
      // The far side of the exponential runs off the top; let it.
      const fr = frame([-1.2, 1.2], [Math.max(lo, -6), Math.min(hi, 6)]);
      return {
        topic: "Maclaurin series",
        prompt: (
          <>
            Let f(x) = {fx}. Use the Maclaurin series for f to find f
            {sup(`(${n})`)}
            (0), the {n}th derivative of f at 0.
          </>
        ),
        description: `The graph of f(x) = ${fx} near x = 0.`,
        figure: (
          <>
            <Axes frame={fr} />
            <Curve frame={fr} points={pts} color={BLUE} />
            <Dot at={[fr.x(0), fr.y(0)]} color={ROSE} />
          </>
        ),
        hint: `Multiply the series for ${expo(q)} by ${power("x", p)} and read off the coefficient of x${sup(n)}; that coefficient is f${sup(`(${n})`)}(0) / ${n}!.`,
      };
    }
    case "cos": {
      const { q, k } = params;
      const n = 4 * k;
      const f = (x: number) => Math.cos(q * x * x);
      const fx = `cos(${terms([[q, "x²"]])})`;
      const pts = samples(f, -2.2, 2.2, 400);
      const fr = frame([-2.2, 2.2], [-1.3, 1.3]);
      return {
        topic: "Maclaurin series",
        prompt: (
          <>
            Let f(x) = {fx}. Find f{sup(`(${n})`)}(0), the {n}th derivative of f
            at 0.
          </>
        ),
        description: `The graph of f(x) = ${fx} near x = 0.`,
        figure: (
          <>
            <Axes frame={fr} />
            <Curve frame={fr} points={pts} color={BLUE} />
            <Dot at={[fr.x(0), fr.y(1)]} color={ROSE} />
          </>
        ),
        hint: `Substitute ${terms([[q, "x²"]])} into the series for cos u. The coefficient of x${sup(n)} is f${sup(`(${n})`)}(0) / ${n}!.`,
      };
    }
    case "nrn": {
      const { p, q } = params;
      const term = (n: number) => n * (p / q) ** n;
      return {
        topic: "Infinite series",
        prompt: (
          <>
            Find the sum of the series Σ n·({p}/{q}){sup("n")} for n = 1 to ∞.
          </>
        ),
        description: `A bar chart of the first twelve terms n·(${p}/${q})ⁿ, which rise and then shrink towards zero.`,
        figure: (
          <Bars
            terms={Array.from({ length: 12 }, (_, i) => term(i + 1))}
            name={`n(${p}/${q})ⁿ`}
          />
        ),
        hint: "Differentiate the geometric series Σ xⁿ = 1/(1 − x) term by term, then multiply by x.",
      };
    }
    case "telescope": {
      const { k } = params;
      const term = (n: number) => 1 / (n * (n + k));
      return {
        topic: "Infinite series",
        prompt: (
          <>Find the sum of the series Σ 1 / (n(n + {k})) for n = 1 to ∞.</>
        ),
        description: `A bar chart of the first twelve terms 1 / (n(n + ${k})), shrinking towards zero.`,
        figure: (
          <Bars
            terms={Array.from({ length: 12 }, (_, i) => term(i + 1))}
            name={`1/(n(n+${k}))`}
          />
        ),
        hint: "Partial fractions turn each term into a difference, and the differences telescope. Write out the first few partial sums to see what survives.",
      };
    }
  }
}

/** The terms of a series as bars: what is being summed, not the sum. */
function Bars({ terms: values, name }: { terms: number[]; name: string }) {
  const n = values.length;
  const fr = frame([0, n + 1], span(values, 0.15));
  const w = (fr.x(1) - fr.x(0)) * 0.55;
  return (
    <>
      <Axes frame={fr} xName="n" yName="aₙ" xStep={1} />
      {values.map((value, i) => (
        <rect
          key={i}
          x={fr.x(i + 1) - w / 2}
          y={Math.min(fr.y(value), fr.y(0))}
          width={w}
          height={Math.abs(fr.y(value) - fr.y(0))}
          rx={2}
          fill="url(#calc-blue)"
          stroke={BLUE}
          strokeWidth={1.5}
          className={styles.fade}
        />
      ))}
      <Label at={[fr.x(n) - 20, fr.y(fr.ys[1]) + 16]} color={BLUE} size={13}>
        aₙ = {name}
      </Label>
    </>
  );
}

function polarArea(params: Params<"polar">): Problem {
  const r =
    params.form === "limacon"
      ? (t: number) => params.a + params.b * Math.cos(t)
      : (t: number) => params.a * Math.cos(params.k * t);
  const reach = params.form === "limacon" ? params.a + params.b : params.a;
  const fr = frame(
    [-reach * 1.35, reach * 1.35],
    [-reach * 1.02, reach * 1.02],
  );
  const curve = Array.from({ length: 721 }, (_, i) => {
    const t = (i * Math.PI) / 360;
    return [r(t) * Math.cos(t), r(t) * Math.sin(t)] as Pt;
  });
  const petalHalf = params.form === "rose" ? Math.PI / (2 * params.k) : Math.PI;
  const petal = Array.from({ length: 121 }, (_, i) => {
    const t = -petalHalf + (2 * petalHalf * i) / 120;
    return [r(t) * Math.cos(t), r(t) * Math.sin(t)] as Pt;
  });
  const equation =
    params.form === "limacon"
      ? `r = ${fmt(params.a)} + ${terms([[params.b, "cos θ"]])}`
      : `r = ${terms([[params.a, `cos(${terms([[params.k, "θ"]])})`]])}`;
  const rings = ticks(0, reach, tickStep(reach * 1.5));
  return {
    topic: "Polar area",
    prompt:
      params.form === "limacon" ? (
        <>
          Find the area enclosed by the limaçon {equation}, as a multiple of π.
        </>
      ) : (
        <>
          Find the area of one petal of the rose {equation}, as a multiple of π.
        </>
      ),
    description: `The polar curve ${equation}${params.form === "rose" ? ", with one petal shaded" : ", shaded"}.`,
    figure: (
      <>
        <Axes frame={fr} />
        {rings.slice(1).map((k) => (
          <ellipse
            key={k}
            cx={fr.x(0)}
            cy={fr.y(0)}
            rx={fr.x(k) - fr.x(0)}
            ry={fr.y(0) - fr.y(k)}
            fill="none"
            stroke="#cbd5e1"
            strokeDasharray="3 4"
            className={styles.fade}
          />
        ))}
        <path
          d={`${path(fr, petal)} Z`}
          fill="url(#calc-rose)"
          className={styles.fade}
        />
        <Curve frame={fr} points={curve} color={BLUE} />
        <Label at={[fr.x(0), fr.y(fr.ys[1]) + 14]} color={BLUE} size={13}>
          {equation}
        </Label>
      </>
    ),
    unit: "π",
    hint:
      params.form === "limacon"
        ? "A = ½∫r² dθ over a full turn. Expand the square; ∫cos θ vanishes and ∫cos²θ over 2π is π."
        : `One petal spans the θ interval where cos(${fmt(params.k)}θ) stays non-negative. A = ½∫r² dθ over just that interval.`,
  };
}

function eulerMethod({ p, q, r, x0, y0, h, steps }: Params<"euler">): Problem {
  const slope = (x: number, y: number) => p * x + q * y + r * x * y;
  const xEnd = x0 + steps * h;
  const fr = frame([x0 - 1, xEnd + 1], [y0 - 2.5, y0 + 2.5]);
  const field: ReactNode[] = [];
  const stepX = (fr.xs[1] - fr.xs[0]) / 12;
  const stepY = (fr.ys[1] - fr.ys[0]) / 9;
  const arm = 9;
  for (let i = 0; i <= 12; i++) {
    for (let j = 0; j <= 9; j++) {
      const x = fr.xs[0] + i * stepX;
      const y = fr.ys[0] + j * stepY;
      const kx = fr.x(1) - fr.x(0) || 1;
      const ky = fr.y(0) - fr.y(1) || 1;
      // Direction in screen space, so the slope reads true on skewed axes.
      const angle = Math.atan2(-slope(x, y) * ky, kx);
      field.push(
        <line
          key={`${i}-${j}`}
          x1={fr.x(x) - arm * Math.cos(angle)}
          y1={fr.y(y) - arm * Math.sin(angle)}
          x2={fr.x(x) + arm * Math.cos(angle)}
          y2={fr.y(y) + arm * Math.sin(angle)}
          stroke={AXIS}
          strokeOpacity={0.55}
          strokeWidth={1.5}
          strokeLinecap="round"
          className={styles.fade}
        />,
      );
    }
  }
  const rule = eulerRule(p, q, r);
  return {
    topic: "Euler's method",
    prompt: (
      <>
        Let y = f(x) be the solution of dy/dx = {rule} with f({fmt(x0)}) ={" "}
        {fmt(y0)}. Use Euler&apos;s method with {steps} steps of size h ={" "}
        {fmt(h)} to approximate f({fmt(xEnd)}).
      </>
    ),
    description: `The slope field of dy/dx = ${rule}, with the starting point (${fmt(x0)}, ${fmt(y0)}) marked and the target x = ${fmt(xEnd)} marked with a dashed line.`,
    figure: (
      <>
        <Axes frame={fr} />
        {field}
        <Curve
          frame={fr}
          points={[
            [xEnd, fr.ys[0]],
            [xEnd, fr.ys[1]],
          ]}
          color={VIOLET}
          width={1.5}
          dashed
        />
        <Dot at={[fr.x(x0), fr.y(y0)]} color={ROSE} />
        <Label at={[fr.x(x0), fr.y(y0) - 16]} color={ROSE} size={13}>
          ({fmt(x0)}, {fmt(y0)})
        </Label>
        <Label at={[fr.x(xEnd), fr.y(fr.ys[1]) + 14]} color={VIOLET} size={13}>
          x = {fmt(xEnd)}
        </Label>
      </>
    ),
    hint: "Each step: new y = old y + h × (slope at the old point). Recompute the slope from the new x and y every time; the x moves by h too.",
  };
}

function openBox({ w, l, ask }: Params<"optimize">): Problem {
  const cut = Math.min(w, l) * 0.18;
  const raw: Pt[] = [
    [0, 0],
    [l, 0],
    [l, w],
    [0, w],
  ];
  const pad = 46;
  const k = Math.min((WIDTH - pad * 2) / l, (HEIGHT - pad * 2) / w);
  const ox = (WIDTH - l * k) / 2;
  const oy = (HEIGHT - w * k) / 2;
  const map = ([x, y]: Pt): Pt => [ox + x * k, oy + y * k];
  const corners = raw.map(map);
  const c = cut * k;
  const squares = corners.map(([x, y], i) => {
    const sx = i === 0 || i === 3 ? x : x - c;
    const sy = i === 0 || i === 1 ? y : y - c;
    return [sx, sy] as Pt;
  });
  return {
    topic: "Optimization",
    prompt: (
      <>
        An open-top box is made from a {w} by {l} sheet by cutting equal squares
        of side x from each corner and folding up the sides.{" "}
        {ask === "volume"
          ? "What is the largest volume the box can have?"
          : "What value of x gives the box its largest volume?"}
      </>
    ),
    description: `A ${w} by ${l} rectangular sheet with a square of side x marked in each corner and the fold lines dashed.`,
    figure: (
      <>
        <rect
          x={corners[0][0]}
          y={corners[0][1]}
          width={l * k}
          height={w * k}
          fill="url(#calc-amber)"
          className={styles.fade}
        />
        {squares.map(([x, y], i) => (
          <rect
            key={i}
            x={x}
            y={y}
            width={c}
            height={c}
            fill="white"
            stroke={ROSE}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            className={styles.fade}
          />
        ))}
        {[c, w * k - c].map((y) => (
          <line
            key={`h${y}`}
            x1={corners[0][0] + c}
            y1={corners[0][1] + y}
            x2={corners[1][0] - c}
            y2={corners[0][1] + y}
            stroke={INK}
            strokeWidth={1.5}
            strokeDasharray="6 4"
            className={styles.fade}
          />
        ))}
        {[c, l * k - c].map((x) => (
          <line
            key={`v${x}`}
            x1={corners[0][0] + x}
            y1={corners[0][1] + c}
            x2={corners[0][0] + x}
            y2={corners[3][1] - c}
            stroke={INK}
            strokeWidth={1.5}
            strokeDasharray="6 4"
            className={styles.fade}
          />
        ))}
        <rect
          x={corners[0][0]}
          y={corners[0][1]}
          width={l * k}
          height={w * k}
          pathLength={1}
          fill="none"
          stroke={INK}
          strokeWidth={2.5}
          className={styles.draw}
        />
        <Label at={[WIDTH / 2, corners[3][1] + 18]} color={INK}>
          {l}
        </Label>
        <Label at={[corners[1][0] + 18, HEIGHT / 2]} color={INK}>
          {w}
        </Label>
        <Label
          at={[corners[0][0] + c / 2, corners[0][1] - 12]}
          color={ROSE}
          size={13}
        >
          x
        </Label>
        <Label
          at={[corners[0][0] - 12, corners[0][1] + c / 2]}
          color={ROSE}
          size={13}
        >
          x
        </Label>
      </>
    ),
    hint: "V(x) = x(w − 2x)(l − 2x). Set V′(x) = 0 and take the root that leaves both sides positive; the discriminant is a perfect square here.",
  };
}

function limitProblem(params: Params<"limit">): Problem {
  if (params.form === "power") {
    const { a, b } = params;
    const f = (x: number) => (1 + a / x) ** (b * x);
    const pts = samples(f, 1, 40, 200);
    const fr = frame(
      [0, 42],
      span(
        pts.map((p) => p[1]),
        0.15,
      ),
    );
    const text = `(1 + ${fmt(a)}/x)${sup(`${b}x`)}`;
    return {
      topic: "Limits",
      prompt: (
        <>
          Find lim (1 + {fmt(a)}/x){sup(`${b}x`)} as x → ∞. {DECIMALS}
        </>
      ),
      description: `The graph of ${text} for x from 1 to 40, levelling off.`,
      figure: (
        <>
          <Axes frame={fr} />
          <Curve frame={fr} points={pts} color={BLUE} />
          <Label at={[fr.x(30), fr.y(fr.ys[1]) + 16]} color={BLUE} size={13}>
            y = {text}
          </Label>
        </>
      ),
      hint: "Take the logarithm first: the limit of bx·ln(1 + a/x) is a 0·∞ form. Rewrite it as a quotient for L'Hôpital, then exponentiate.",
    };
  }
  const { a } = params;
  const ax = terms([[a, "x"]]);
  const [top, bottom, topText, bottomText, hint] = ((): [
    (x: number) => number,
    (x: number) => number,
    string,
    string,
    string,
  ] => {
    switch (params.form) {
      case "expo":
        return [
          (x) => Math.exp(a * x) - 1 - a * x,
          (x) => x * x,
          terms([
            [1, expo(a)],
            [-1, ""],
            [-a, "x"],
          ]),
          "x²",
          "It is 0/0, twice over: L'Hôpital once still gives 0/0, so differentiate again. Or expand the exponential as a series.",
        ];
      case "tan":
        return [
          (x) => Math.tan(a * x) - a * x,
          (x) => x ** 3,
          `tan(${ax}) − ${ax}`,
          "x³",
          "The numerator vanishes to third order. The Maclaurin series of tan u starts u + u³/3; substituting u = ax is faster than three rounds of L'Hôpital.",
        ];
      case "cos": {
        const { b } = params;
        return [
          (x) => 1 - Math.cos(a * x),
          (x) => x * Math.sin(b * x),
          `1 − cos(${ax})`,
          `x·sin(${terms([[b, "x"]])})`,
          "Both top and bottom vanish to second order. Use 1 − cos u ≈ u²/2 and sin u ≈ u, or L'Hôpital twice.",
        ];
      }
    }
  })();
  const reach = 1.2 / Math.max(1, Math.abs(a));
  const topPts = samples(top, -reach, reach);
  const bottomPts = samples(bottom, -reach, reach);
  const fr = frame(
    [-reach, reach],
    span(
      [...topPts, ...bottomPts].map((p) => p[1]),
      0.15,
    ),
  );
  return {
    topic: "Limits",
    prompt: (
      <>
        Find lim ({topText}) / ({bottomText}) as x → 0.
      </>
    ),
    description: `The graphs of the numerator ${topText} and the denominator ${bottomText} near x = 0, both passing through the origin.`,
    figure: (
      <>
        <Axes frame={fr} />
        <Curve frame={fr} points={bottomPts} color={AMBER} />
        <Curve frame={fr} points={topPts} color={BLUE} />
        <Dot at={[fr.x(0), fr.y(0)]} color={ROSE} hollow />
        <Label
          at={[fr.x(reach * 0.55), fr.y(fr.ys[1]) + 16]}
          color={BLUE}
          size={13}
        >
          {topText}
        </Label>
        <Label
          at={[fr.x(reach * 0.55), fr.y(fr.ys[1]) + 34]}
          color={AMBER}
          size={13}
        >
          {bottomText}
        </Label>
      </>
    ),
    hint,
  };
}

function tableRules({ mode, f, df, g, dg, a }: Params<"table">): Problem {
  const rows = [
    ["f(x)", f],
    ["f′(x)", df],
    ["g(x)", g],
    ["g′(x)", dg],
  ] as const;
  const shown = mode === "inverse" ? rows.slice(0, 2) : rows;
  const value = f[a - 1];
  const [prompt, hint] =
    mode === "chain"
      ? [
          <>
            The table gives values of f, f′, g and g′ at selected x. If h(x) =
            f(g(x)), find h′({a}).
          </>,
          "Chain rule: h′(x) = f′(g(x))·g′(x). Look up g(a) first, then read f′ at that value, not at a.",
        ]
      : mode === "quotient"
        ? [
            <>
              The table gives values of f, f′, g and g′ at selected x. If k(x) =
              f(x) / g(x), find k′({a}).
            </>,
            "Quotient rule: (f′g − fg′) / g², all evaluated at the same x. Keep the order of the numerator straight.",
          ]
        : [
            <>
              The table gives values of a one-to-one function f and its
              derivative at selected x. Find (f⁻¹)′({fmt(value)}).
            </>,
            "(f⁻¹)′(v) = 1 / f′(f⁻¹(v)). Find which x has f(x) = v, then use f′ there, not f′(v).",
          ];
  return {
    topic: "Derivative rules from a table",
    prompt,
    description: `A table with x = 1, 2, 3, 4 across the top and rows for ${shown.map(([name]) => name).join(", ")}: ${shown.map(([name, values]) => `${name} is ${values.map(fmt).join(", ")}`).join("; ")}.`,
    figure: <Table head={["1", "2", "3", "4"]} rows={shown} />,
    hint,
  };
}

function definiteIntegral(params: Params<"integral">): Problem {
  const [f, from, to, text, hint] =
    params.form === "parts"
      ? [
          (x: number) => x * Math.exp(params.a * x),
          0,
          1,
          `x·${expo(params.a)}`,
          "Integrate by parts with u = x and dv = the exponential; the boundary term and the leftover integral both need care with the sign of a.",
        ]
      : params.form === "fractions"
        ? [
            (x: number) => 1 / ((x + params.p) * (x + params.q)),
            0,
            1,
            `1 / ((x + ${params.p})(x + ${params.q}))`,
            "Partial fractions split the integrand into 1/(x + p) − 1/(x + q), scaled. Both pieces integrate to logarithms.",
          ]
        : params.form === "usub"
          ? [
              (x: number) => x * Math.sqrt(x * x + params.p * params.p),
              0,
              params.q,
              `x·√(x² + ${params.p * params.p})`,
              "Substitute u = x² + p²; the x in front is half of du. Change the limits to u values and the square roots come out whole.",
            ]
          : [
              (x: number) => x ** params.n * Math.log(x),
              1,
              Math.E,
              `${power("x", params.n)}·ln x`,
              "Integrate by parts with u = ln x, since ln x is what you want to differentiate away.",
            ];
  const limits = params.form === "log" ? "from 1 to e" : `from 0 to ${fmt(to)}`;
  const exact = params.form === "usub";
  const pts = samples(f, from, to);
  const lo = from - (to - from) * 0.15;
  const hi = to + (to - from) * 0.15;
  const fr = frame(
    [lo, hi],
    span(
      pts.map((p) => p[1]),
      0.15,
    ),
  );
  return {
    topic: "Definite integrals",
    prompt: (
      <>
        Evaluate the integral of {text} {limits}.{" "}
        {exact ? "The answer is exact." : DECIMALS}
      </>
    ),
    description: `The graph of ${text} with the area under it ${limits} shaded.`,
    figure: (
      <>
        <Axes frame={fr} />
        <Region
          frame={fr}
          top={pts}
          bottom={pts.map(([x]) => [x, 0] as Pt)}
          fill="url(#calc-blue)"
        />
        <Curve frame={fr} points={samples(f, lo, hi)} color={BLUE} />
        <Label
          at={[fr.x((from + to) / 2), fr.y(fr.ys[1]) + 16]}
          color={BLUE}
          size={13}
        >
          y = {text}
        </Label>
      </>
    ),
    hint,
  };
}

function parametricCurve({ p, q, r, t0, ask }: Params<"parametric">): Problem {
  const x = (t: number) => t ** 3 + p * t;
  const y = (t: number) => q * t * t + r * t;
  const pts = Array.from({ length: 241 }, (_, i) => {
    const t = t0 - 1.5 + (3 * i) / 240;
    return [x(t), y(t)] as Pt;
  });
  const fr = frame(
    span(
      pts.map((pt) => pt[0]),
      0.1,
    ),
    span(
      pts.map((pt) => pt[1]),
      0.1,
    ),
  );
  const at: Pt = [fr.x(x(t0)), fr.y(y(t0))];
  const xText = poly([0, p, 0, 1], "t");
  const yText = poly([0, r, q], "t");
  const [question, hint] =
    ask === "slope"
      ? [
          `Find dy/dx at t = ${fmt(t0)}.`,
          "dy/dx = (dy/dt) / (dx/dt). Evaluate both rates at t₀ before dividing.",
        ]
      : ask === "concavity"
        ? [
            `Find d²y/dx² at t = ${fmt(t0)}.`,
            "d²y/dx² is the t-derivative of dy/dx, divided by dx/dt again. Differentiate the quotient (dy/dt)/(dx/dt) with respect to t, then divide.",
          ]
        : [
            `Find the particle's speed at t = ${fmt(t0)}. ${DECIMALS}`,
            "Speed is √((dx/dt)² + (dy/dt)²) at that instant.",
          ];
  return {
    topic: "Parametric curves",
    prompt: (
      <>
        A particle moves so that x(t) = {xText} and y(t) = {yText}. {question}
      </>
    ),
    description: `The path traced by the particle, with its position at t = ${fmt(t0)} marked.`,
    figure: (
      <>
        <Axes frame={fr} />
        <Curve frame={fr} points={pts} color={BLUE} />
        <Dot at={at} color={ROSE} />
        <Label at={[at[0], at[1] - 16]} color={ROSE} size={13}>
          t = {fmt(t0)}
        </Label>
      </>
    ),
    hint,
  };
}

function relatedRates(params: Params<"related">): Problem {
  if (params.mode === "ladder") {
    const { x, y, u } = params;
    const length = Math.hypot(x, y);
    const fr = frame([-0.6, x + 0.6 + length * 0.2], [-0.6, y + 0.6]);
    const floor: Pt = [fr.x(0), fr.y(0)];
    const foot: Pt = [fr.x(x), fr.y(0)];
    const top: Pt = [fr.x(0), fr.y(y)];
    return {
      topic: "Related rates",
      prompt: (
        <>
          A {fmt(length)} m ladder leans against a vertical wall. Its foot
          slides away from the wall at {u} m/s. When the foot is {x} m from the
          wall, how fast is the top of the ladder sliding down the wall, in m/s?
        </>
      ),
      description: `A ladder of length ${fmt(length)} against a wall, its foot ${x} from the wall and its top ${y} up, with an arrow showing the foot moving away at ${u}.`,
      figure: (
        <>
          <line
            x1={fr.x(0)}
            y1={fr.y(fr.ys[1])}
            x2={fr.x(0)}
            y2={floor[1]}
            stroke={INK}
            strokeWidth={4}
            className={styles.fade}
          />
          <line
            x1={fr.x(fr.xs[0])}
            y1={floor[1]}
            x2={fr.x(fr.xs[1])}
            y2={floor[1]}
            stroke={INK}
            strokeWidth={4}
            className={styles.fade}
          />
          <polygon
            points={`${floor} ${foot} ${top}`}
            fill="url(#calc-blue)"
            className={styles.fade}
          />
          <line
            x1={foot[0]}
            y1={foot[1]}
            x2={top[0]}
            y2={top[1]}
            pathLength={1}
            stroke={AMBER}
            strokeWidth={6}
            strokeLinecap="round"
            className={styles.draw}
          />
          <line
            x1={foot[0] + 8}
            y1={foot[1] - 14}
            x2={foot[0] + 34}
            y2={foot[1] - 14}
            stroke={ROSE}
            strokeWidth={2.5}
            markerEnd="url(#calc-arrow-rose)"
            className={styles.fade}
          />
          <Label at={[foot[0] + 22, foot[1] - 28]} color={ROSE} size={13}>
            {u} m/s
          </Label>
          <Label at={[(floor[0] + foot[0]) / 2, floor[1] + 18]} color={INK}>
            {x}
          </Label>
          <Label at={[top[0] - 18, (top[1] + floor[1]) / 2]} color={INK}>
            {y}
          </Label>
          <Label
            at={[(foot[0] + top[0]) / 2 + 20, (foot[1] + top[1]) / 2 - 12]}
            color={AMBER}
          >
            {fmt(length)}
          </Label>
        </>
      ),
      hint: "x² + y² is constant, so 2x·x′ + 2y·y′ = 0. Find y from the Pythagorean theorem first, then solve for y′.",
    };
  }
  const { d, east, north, t } = params;
  const gapX = d - east * t;
  const gapY = north * t;
  const fr = frame([-d - 2, 2 + gapX * 0.3], [-2, gapY + 2]);
  const A0: Pt = [fr.x(-d), fr.y(0)];
  const A: Pt = [fr.x(-gapX), fr.y(0)];
  const B0: Pt = [fr.x(0), fr.y(0)];
  const B: Pt = [fr.x(0), fr.y(gapY)];
  const hour = t === 1 ? "1 pm" : `${t} pm`;
  return {
    topic: "Related rates",
    prompt: (
      <>
        At noon, ship A is {d} km due west of ship B. A sails east at {east}{" "}
        km/h and B sails north at {north} km/h. How fast is the distance between
        the ships changing at {hour}, in km/h? A negative answer means the
        distance is shrinking.
      </>
    ),
    description: `Ship A starts ${d} km west of ship B. Their positions at ${hour} are shown, A having moved ${east * t} km east and B ${gapY} km north, with the distance between them drawn.`,
    figure: (
      <>
        <Axes frame={fr} xName="" yName="" />
        <line
          x1={A0[0]}
          y1={A0[1]}
          x2={A[0]}
          y2={A[1]}
          stroke={BLUE}
          strokeWidth={3}
          strokeDasharray="6 4"
          markerEnd="url(#calc-arrow-blue)"
          className={styles.fade}
        />
        <line
          x1={B0[0]}
          y1={B0[1]}
          x2={B[0]}
          y2={B[1]}
          stroke={EMERALD}
          strokeWidth={3}
          strokeDasharray="6 4"
          markerEnd="url(#calc-arrow-emerald)"
          className={styles.fade}
        />
        <line
          x1={A[0]}
          y1={A[1]}
          x2={B[0]}
          y2={B[1]}
          pathLength={1}
          stroke={ROSE}
          strokeWidth={2.5}
          className={styles.draw}
        />
        <Dot at={A0} color={BLUE} hollow />
        <Dot at={A} color={BLUE} />
        <Dot at={B0} color={EMERALD} hollow />
        <Dot at={B} color={EMERALD} />
        <Label at={[A0[0], A0[1] + 18]} color={BLUE} size={13}>
          A at noon
        </Label>
        <Label
          at={[A[0] + 10, A[1] - 20]}
          color={BLUE}
          size={13}
          anchor="start"
        >
          A, {east} km/h
        </Label>
        <Label at={[B0[0] + 12, B0[1] + 18]} color={EMERALD} size={13}>
          B at noon
        </Label>
        <Label
          at={[B[0] + 12, B[1] + 6]}
          color={EMERALD}
          size={13}
          anchor="start"
        >
          B, {north} km/h
        </Label>
        <Label
          at={[(A[0] + B[0]) / 2 - 14, (A[1] + B[1]) / 2 - 12]}
          color={ROSE}
          size={13}
        >
          s
        </Label>
      </>
    ),
    hint: "Let x and y be the east–west and north–south gaps; s² = x² + y², so s·s′ = x·x′ + y·y′. One gap is shrinking, so one rate is negative.",
  };
}

export function describePuzzle(params: PuzzleParams): Problem {
  switch (params.kind) {
    case "area":
      return areaBetween(params);
    case "volume":
      return volumeWashers(params);
    case "ftc":
      return accumulation(params);
    case "motion":
      return particleMotion(params);
    case "implicit":
      return implicitCurve(params);
    case "series":
      return seriesProblem(params);
    case "polar":
      return polarArea(params);
    case "euler":
      return eulerMethod(params);
    case "optimize":
      return openBox(params);
    case "limit":
      return limitProblem(params);
    case "table":
      return tableRules(params);
    case "integral":
      return definiteIntegral(params);
    case "parametric":
      return parametricCurve(params);
    case "related":
      return relatedRates(params);
  }
}
