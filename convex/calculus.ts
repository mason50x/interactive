import { v, type Infer } from "convex/values";
import {
  MINUS,
  expo,
  fmt,
  paren,
  poly,
  polyAt,
  power,
  show,
  sup,
  terms,
} from "../src/lib/calculus-text";

/**
 * The timeout-screen calculus problems, server side.
 *
 * AP Calculus BC, and the hard end of it: areas between a cubic and a line,
 * washers about an off-axis line, accumulation from a graph of f′, total
 * distance from a cubic velocity, implicit second derivatives, Maclaurin
 * coefficients read back as high derivatives, polar areas, Euler's method,
 * the open-box optimisation, L'Hôpital limits, table-driven chain and
 * quotient rules, integration by parts and partial fractions, parametric
 * curvature, and related rates.
 *
 * A problem leaves here as its givens only. The answer and the worked
 * solution stay on the server until the guess is in, so neither the network
 * response nor the client bundle can hand one over. The browser draws the
 * figure from the same givens (see `src/components/app/calculus/problems.tsx`).
 * Every answer is a single number, and every one of them is exact here:
 * closed forms, never numerical integration.
 */

const num = v.number;
const numbers = () => v.array(v.number());

export const puzzleParams = v.union(
  /** Total area between the cubic f and the line g, meeting at r1 < r2 < r3. */
  v.object({
    kind: v.literal("area"),
    r1: num(),
    r2: num(),
    r3: num(),
    m: num(),
    b: num(),
  }),
  /** Region between y = ax and y = x² revolved about the line y = axis. */
  v.object({ kind: v.literal("volume"), a: num(), axis: num() }),
  /** f′ is piecewise linear through (i, ys[i]); f(a) = c, find f(b). */
  v.object({
    kind: v.literal("ftc"),
    ys: numbers(),
    a: num(),
    c: num(),
    b: num(),
  }),
  /** v(t) = sign · t (t − r1)(t − r2) on [0, end]. */
  v.object({
    kind: v.literal("motion"),
    r1: num(),
    r2: num(),
    end: num(),
    sign: num(),
    ask: v.union(v.literal("distance"), v.literal("displacement")),
  }),
  /** dy/dx on x³ + y³ = a·xy + c at (x0, y0); c is what makes it fit. */
  v.object({
    kind: v.literal("implicit"),
    mode: v.literal("slope"),
    a: num(),
    x0: num(),
    y0: num(),
  }),
  /** d²y/dx² on x² + b·y² = c at (x0, y0). */
  v.object({
    kind: v.literal("implicit"),
    mode: v.literal("concavity"),
    b: num(),
    x0: num(),
    y0: num(),
  }),
  /** The nth derivative at 0 of x^p · e^(qx). */
  v.object({
    kind: v.literal("series"),
    form: v.literal("xe"),
    p: num(),
    q: num(),
    n: num(),
  }),
  /** The (4k)th derivative at 0 of cos(q·x²). */
  v.object({
    kind: v.literal("series"),
    form: v.literal("cos"),
    q: num(),
    k: num(),
  }),
  /** Σ n·(p/q)^n from n = 1. */
  v.object({
    kind: v.literal("series"),
    form: v.literal("nrn"),
    p: num(),
    q: num(),
  }),
  /** Σ 1 / (n (n + k)) from n = 1. */
  v.object({ kind: v.literal("series"), form: v.literal("telescope"), k: num() }),
  /** Area inside r = a + b cos θ, a ≥ b. */
  v.object({
    kind: v.literal("polar"),
    form: v.literal("limacon"),
    a: num(),
    b: num(),
  }),
  /** Area of one petal of r = a cos(kθ). */
  v.object({
    kind: v.literal("polar"),
    form: v.literal("rose"),
    a: num(),
    k: num(),
  }),
  /** Euler's method for dy/dx = p·x + q·y + r·xy from (x0, y0). */
  v.object({
    kind: v.literal("euler"),
    p: num(),
    q: num(),
    r: num(),
    x0: num(),
    y0: num(),
    h: num(),
    steps: num(),
  }),
  /** The open box folded from a w × l sheet with corner squares cut out. */
  v.object({
    kind: v.literal("optimize"),
    w: num(),
    l: num(),
    ask: v.union(v.literal("volume"), v.literal("cut")),
  }),
  v.object({
    kind: v.literal("limit"),
    form: v.union(v.literal("expo"), v.literal("tan")),
    a: num(),
  }),
  v.object({
    kind: v.literal("limit"),
    form: v.union(v.literal("cos"), v.literal("power")),
    a: num(),
    b: num(),
  }),
  /** Values of f, f′, g, g′ at x = 1, 2, 3, 4. */
  v.object({
    kind: v.literal("table"),
    mode: v.union(
      v.literal("chain"),
      v.literal("quotient"),
      v.literal("inverse"),
    ),
    f: numbers(),
    df: numbers(),
    g: numbers(),
    dg: numbers(),
    a: num(),
  }),
  /** ∫₀¹ x·e^(ax) dx. */
  v.object({ kind: v.literal("integral"), form: v.literal("parts"), a: num() }),
  /** ∫₀¹ dx / ((x + p)(x + q)). */
  v.object({
    kind: v.literal("integral"),
    form: v.literal("fractions"),
    p: num(),
    q: num(),
  }),
  /** ∫₀^q x·√(x² + p²) dx, with (p, q, √(p² + q²)) a Pythagorean triple. */
  v.object({
    kind: v.literal("integral"),
    form: v.literal("usub"),
    p: num(),
    q: num(),
  }),
  /** ∫₁^e xⁿ ln x dx. */
  v.object({ kind: v.literal("integral"), form: v.literal("log"), n: num() }),
  /** x = t³ + p·t, y = q·t² + r·t at t = t0. */
  v.object({
    kind: v.literal("parametric"),
    p: num(),
    q: num(),
    r: num(),
    t0: num(),
    ask: v.union(v.literal("slope"), v.literal("concavity"), v.literal("speed")),
  }),
  /** Ship A starts d km west of B, sails east at `east`; B sails north. */
  v.object({
    kind: v.literal("related"),
    mode: v.literal("ships"),
    d: num(),
    east: num(),
    north: num(),
    t: num(),
  }),
  /** A ladder whose foot is x from the wall, top y up it, foot moving at u. */
  v.object({
    kind: v.literal("related"),
    mode: v.literal("ladder"),
    x: num(),
    y: num(),
    u: num(),
  }),
);

export type PuzzleParams = Infer<typeof puzzleParams>;

/**
 * The geometry puzzles this screen used to set. Rows written before the
 * switch still hold one of these, and the schema has to keep accepting them
 * until `dataMaintenance.pruneLegacyPuzzles` has run on every deployment.
 * Nothing generates or grades one: `timeoutPuzzles.liveRow` treats a row
 * holding one as stale, and the next `start` replaces it.
 */
export const legacyPuzzleParams = v.union(
  v.object({ kind: v.literal("triangle"), a: num(), b: num() }),
  v.object({
    kind: v.literal("pythagoras"),
    mode: v.literal("hypotenuse"),
    a: num(),
    b: num(),
  }),
  v.object({
    kind: v.literal("pythagoras"),
    mode: v.literal("leg"),
    a: num(),
    c: num(),
  }),
  v.object({
    kind: v.literal("circle"),
    mode: v.union(v.literal("area"), v.literal("circumference")),
    r: num(),
  }),
  v.object({
    kind: v.literal("inscribed"),
    mode: v.literal("inscribed"),
    central: num(),
    p: num(),
  }),
  v.object({
    kind: v.literal("inscribed"),
    mode: v.literal("central"),
    inscribed: num(),
    p: num(),
  }),
  v.object({ kind: v.literal("polygon"), n: num() }),
  v.object({
    kind: v.literal("parallel"),
    relationship: v.union(
      v.literal("corresponding"),
      v.literal("alternate"),
      v.literal("co-interior"),
      v.literal("vertical"),
    ),
    known: num(),
  }),
  v.object({
    kind: v.literal("trapezoid"),
    top: num(),
    base: num(),
    height: num(),
    offset: num(),
  }),
  v.object({
    kind: v.literal("similar"),
    base: num(),
    left: num(),
    right: num(),
    bigBase: num(),
  }),
  v.object({ kind: v.literal("shaded"), side: num() }),
);

export type LegacyPuzzleParams = Infer<typeof legacyPuzzleParams>;

export const PUZZLE_KINDS = [
  "area",
  "volume",
  "ftc",
  "motion",
  "implicit",
  "series",
  "polar",
  "euler",
  "optimize",
  "limit",
  "table",
  "integral",
  "parametric",
  "related",
] as const satisfies readonly PuzzleParams["kind"][];

export function isCurrentPuzzle(
  params: PuzzleParams | LegacyPuzzleParams,
): params is PuzzleParams {
  return (PUZZLE_KINDS as readonly string[]).includes(params.kind);
}

type Rng = () => number;
const int = (rng: Rng, min: number, max: number) =>
  min + Math.floor(rng() * (max - min + 1));
const pick = <T>(rng: Rng, items: readonly T[]) =>
  items[Math.floor(rng() * items.length)];
/** A non-zero integer in [−span, span]. */
const nonzero = (rng: Rng, span: number) => {
  const n = int(rng, 1, span);
  return rng() < 0.5 ? n : -n;
};
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const shuffle = <T>(rng: Rng, items: readonly T[]) => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/** Sheets whose best cut comes out rational: w² − wl + l² is a square. */
export const BOX_SHEETS = [
  [3, 8],
  [5, 8],
  [7, 15],
  [8, 15],
  [5, 21],
  [16, 21],
] as const;

const TRIPLES = [
  [3, 4, 5],
  [5, 12, 13],
  [8, 15, 17],
  [7, 24, 25],
] as const;

const GENERATORS: readonly ((rng: Rng) => PuzzleParams)[] = [
  (rng) => {
    // Three distinct integer roots with two lobes of unequal width, so the
    // answer is not just a symmetric double-count.
    const r1 = int(rng, -3, 0);
    const r2 = r1 + int(rng, 1, 2);
    const r3 = r2 + int(rng, 1, 3);
    return { kind: "area", r1, r2, r3, m: int(rng, -3, 3), b: int(rng, -4, 4) };
  },
  (rng) => {
    const a = int(rng, 1, 3);
    const below = rng() < 0.5;
    return {
      kind: "volume",
      a,
      axis: below ? -int(rng, 1, 3) : a * a + int(rng, 0, 3),
    };
  },
  (rng) => {
    const n = int(rng, 6, 8);
    let ys: number[];
    do {
      ys = Array.from({ length: n + 1 }, () => int(rng, -3, 3));
    } while (
      !ys.some((y) => y > 0) ||
      !ys.some((y) => y < 0) ||
      ys.filter((y) => y === 0).length > 2
    );
    const [a, b] = shuffle(
      rng,
      Array.from({ length: n + 1 }, (_, i) => i),
    );
    return { kind: "ftc", ys, a, c: int(rng, -5, 5), b };
  },
  (rng) => {
    const r1 = int(rng, 1, 3);
    const r2 = r1 + int(rng, 1, 3);
    return {
      kind: "motion",
      r1,
      r2,
      end: r2 + int(rng, 1, 2),
      sign: rng() < 0.5 ? 1 : -1,
      ask: rng() < 0.7 ? "distance" : "displacement",
    };
  },
  (rng) => {
    if (rng() < 0.5) {
      for (;;) {
        const a = int(rng, 1, 6);
        const x0 = nonzero(rng, 3);
        const y0 = nonzero(rng, 3);
        if (3 * y0 * y0 - a * x0 !== 0 && a * y0 - 3 * x0 * x0 !== 0)
          return { kind: "implicit", mode: "slope", a, x0, y0 };
      }
    }
    return {
      kind: "implicit",
      mode: "concavity",
      b: int(rng, 2, 5),
      x0: nonzero(rng, 4),
      y0: nonzero(rng, 3),
    };
  },
  (rng) => {
    switch (int(rng, 0, 3)) {
      case 0: {
        const p = int(rng, 1, 3);
        return {
          kind: "series",
          form: "xe",
          p,
          q: nonzero(rng, 3),
          n: p + int(rng, 2, 4),
        };
      }
      case 1:
        return { kind: "series", form: "cos", q: int(rng, 1, 3), k: int(rng, 1, 2) };
      case 2: {
        for (;;) {
          const q = int(rng, 2, 5);
          const p = int(rng, 1, q - 1);
          if (gcd(p, q) === 1) return { kind: "series", form: "nrn", p, q };
        }
      }
      default:
        return { kind: "series", form: "telescope", k: int(rng, 2, 5) };
    }
  },
  (rng) => {
    if (rng() < 0.5) {
      const b = int(rng, 1, 4);
      return { kind: "polar", form: "limacon", a: b + int(rng, 0, 3), b };
    }
    return { kind: "polar", form: "rose", a: int(rng, 1, 4), k: int(rng, 2, 5) };
  },
  (rng) => {
    let p: number, q: number, r: number;
    do {
      p = int(rng, -2, 2);
      q = int(rng, -2, 2);
      r = int(rng, -1, 1);
    } while ((p === 0 && q === 0) || (r === 0 && (p === 0 || q === 0)));
    return {
      kind: "euler",
      p,
      q,
      r,
      x0: int(rng, -1, 2),
      y0: int(rng, -2, 3),
      h: pick(rng, [0.5, 0.25, 0.2] as const),
      steps: int(rng, 2, 3),
    };
  },
  (rng) => {
    const [w, l] = pick(rng, BOX_SHEETS);
    const m = int(rng, 1, 2);
    return {
      kind: "optimize",
      w: w * m,
      l: l * m,
      ask: rng() < 0.6 ? "volume" : "cut",
    };
  },
  (rng) => {
    switch (int(rng, 0, 3)) {
      case 0:
        return { kind: "limit", form: "expo", a: nonzero(rng, 4) };
      case 1:
        return { kind: "limit", form: "tan", a: nonzero(rng, 3) };
      case 2:
        return { kind: "limit", form: "cos", a: int(rng, 1, 5), b: int(rng, 1, 4) };
      default:
        return { kind: "limit", form: "power", a: nonzero(rng, 3), b: int(rng, 1, 3) };
    }
  },
  (rng) => {
    // f strictly increasing with distinct values, so it has an inverse and
    // every f′(g(a)) lookup lands in the table.
    const f: number[] = [];
    let last = int(rng, -4, 0);
    for (let i = 0; i < 4; i++) f.push((last += int(rng, 1, 4)));
    const df = Array.from({ length: 4 }, () => int(rng, 1, 6));
    const g = Array.from({ length: 4 }, () => int(rng, 1, 4));
    const dg = Array.from({ length: 4 }, () => nonzero(rng, 4));
    return {
      kind: "table",
      mode: pick(rng, ["chain", "quotient", "inverse"] as const),
      f,
      df,
      g,
      dg,
      a: int(rng, 1, 4),
    };
  },
  (rng) => {
    switch (int(rng, 0, 3)) {
      case 0:
        return { kind: "integral", form: "parts", a: nonzero(rng, 3) };
      case 1: {
        const p = int(rng, 1, 4);
        return { kind: "integral", form: "fractions", p, q: p + int(rng, 1, 3) };
      }
      case 2: {
        const [p, q] = pick(rng, TRIPLES);
        return rng() < 0.5
          ? { kind: "integral", form: "usub", p, q }
          : { kind: "integral", form: "usub", p: q, q: p };
      }
      default:
        return { kind: "integral", form: "log", n: int(rng, 1, 3) };
    }
  },
  (rng) => {
    for (;;) {
      const p = int(rng, -3, 3);
      const t0 = int(rng, -2, 2);
      const dx = 3 * t0 * t0 + p;
      if (dx === 0) continue;
      const q = nonzero(rng, 3);
      const r = int(rng, -3, 3);
      const ask = pick(rng, ["slope", "concavity", "speed"] as const);
      // A curvature that rounds to 0.00x is no test of anything; ask for one
      // with some size to it.
      const curvature = (2 * q * dx - (2 * q * t0 + r) * 6 * t0) / dx ** 3;
      if (ask === "concavity" && Math.abs(curvature) < 0.05) continue;
      return { kind: "parametric", p, q, r, t0, ask };
    }
  },
  (rng) => {
    const triple = pick(rng, TRIPLES);
    const k = int(rng, 1, 3);
    if (rng() < 0.5) {
      const [x, y] = rng() < 0.5 ? [triple[0], triple[1]] : [triple[1], triple[0]];
      return { kind: "related", mode: "ladder", x: x * k, y: y * k, u: int(rng, 1, 4) };
    }
    const t = int(rng, 1, 2);
    const [gapX, gapY] =
      rng() < 0.5 ? [triple[0], triple[1]] : [triple[1], triple[0]];
    // After t hours the gaps are gapX·k·t and gapY·k·t, still a triple, and
    // both speeds are whole numbers.
    const east = int(rng, 2, 10);
    return {
      kind: "related",
      mode: "ships",
      d: gapX * k * t + east * t,
      east,
      north: gapY * k,
      t,
    };
  },
];

/** A fresh puzzle of a different kind from `previous`, when there is one. */
export function generatePuzzle(
  previous?: PuzzleParams["kind"],
  rng: Rng = Math.random,
): PuzzleParams {
  for (;;) {
    const params = pick(rng, GENERATORS)(rng);
    if (params.kind !== previous) return params;
  }
}

export type Solution = {
  answer: number;
  /** How far off a guess may be and still count. */
  tolerance: number;
  /** The answer as it should read, with its unit. */
  display: string;
  working: string;
};

/**
 * Three decimal places, as the AP exam asks for, with a hair of room for a
 * value rounded at a different step: 0.001 covers a correctly rounded
 * answer, and half as much again covers rounding an intermediate.
 */
export const TOLERANCE = 0.0015;

const factorial = (n: number): number => (n <= 1 ? 1 : n * factorial(n - 1));
/** A quotient, with a denominator of 1 left off. */
const over = (expression: string, denominator: number) =>
  denominator === 1 ? expression : `${expression}/${fmt(denominator)}`;

/** ∫ of a polynomial with ascending coefficients from `from` to `to`. */
function integrate(coefficients: readonly number[], from: number, to: number) {
  const primitive = [0, ...coefficients.map((c, k) => c / (k + 1))];
  return polyAt(primitive, to) - polyAt(primitive, from);
}

/** Signed area under the polyline through (i, ys[i]) from x = a to x = b. */
export function polylineArea(ys: readonly number[], a: number, b: number) {
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  let area = 0;
  for (let i = lo; i < hi; i++) area += (ys[i] + ys[i + 1]) / 2;
  return a <= b ? area : -area;
}

/** The corner cut that maximises the open box from a w × l sheet. */
export function bestCut(w: number, l: number) {
  return (w + l - Math.sqrt(w * w - w * l + l * l)) / 6;
}

export function solve(params: PuzzleParams): Solution {
  const done = (answer: number, unit: string, working: string): Solution => ({
    answer,
    tolerance: TOLERANCE,
    display: `${show(answer)}${unit}`,
    working,
  });
  switch (params.kind) {
    case "area": {
      const { r1, r2, r3 } = params;
      const difference = [
        -r1 * r2 * r3,
        r1 * r2 + r1 * r3 + r2 * r3,
        -(r1 + r2 + r3),
        1,
      ];
      const first = integrate(difference, r1, r2);
      const second = integrate(difference, r2, r3);
      const answer = Math.abs(first) + Math.abs(second);
      return done(
        answer,
        "",
        `f(x) − g(x) = (x ${MINUS} ${paren(r1)})(x ${MINUS} ${paren(r2)})(x ${MINUS} ${paren(r3)}) = ${poly(difference)}, so the curves cross at x = ${fmt(r1)}, ${fmt(r2)} and ${fmt(r3)}. Integrating it gives ${show(first)} on [${fmt(r1)}, ${fmt(r2)}] and ${show(second)} on [${fmt(r2)}, ${fmt(r3)}]; the difference changes sign at ${fmt(r2)}, so the total area is ${show(Math.abs(first))} + ${show(Math.abs(second))} = ${show(answer)}.`,
      );
    }
    case "volume": {
      const { a, axis } = params;
      // On 0 < x < a the line sits above the parabola, so the line is the
      // outer radius when the axis is below the region and the inner one
      // when it is above.
      const outer = axis <= 0 ? [-axis, a] : [axis, 0, -1];
      const inner = axis <= 0 ? [-axis, 0, 1] : [axis, -a];
      const square = (p: readonly number[]) => {
        const out = new Array<number>(p.length * 2 - 1).fill(0);
        p.forEach((ci, i) => p.forEach((cj, j) => (out[i + j] += ci * cj)));
        return out;
      };
      const R2 = square(outer);
      const r2 = square(inner);
      const integrand = Array.from(
        { length: Math.max(R2.length, r2.length) },
        (_, k) => (R2[k] ?? 0) - (r2[k] ?? 0),
      );
      const answer = integrate(integrand, 0, a);
      return done(
        answer,
        "π",
        `Washers about y = ${fmt(axis)}, ${axis <= 0 ? "below" : "above"} the region. Outer radius R(x) = ${poly(outer)}, inner radius r(x) = ${poly(inner)}; V = π∫₀${sup(a)} (R² − r²) dx = π∫₀${sup(a)} (${poly(integrand)}) dx = ${show(answer)}π.`,
      );
    }
    case "ftc": {
      const { ys, a, b, c } = params;
      const area = polylineArea(ys, a, b);
      const answer = c + area;
      return done(
        answer,
        "",
        `f(${fmt(b)}) = f(${fmt(a)}) + ∫ from ${fmt(a)} to ${fmt(b)} of f′(x) dx. That integral is the signed area between the graph and the axis, counting trapezoids square by square${a > b ? " and negated because the limits run backwards" : ""}: ${show(area)}. So f(${fmt(b)}) = ${fmt(c)} + ${paren(area)} = ${show(answer)}.`,
      );
    }
    case "motion": {
      const { r1, r2, end, sign } = params;
      const velocity = [0, sign * r1 * r2, -sign * (r1 + r2), sign];
      const legs = [
        integrate(velocity, 0, r1),
        integrate(velocity, r1, r2),
        integrate(velocity, r2, end),
      ];
      const displacement = legs[0] + legs[1] + legs[2];
      const distance = legs.reduce((sum, leg) => sum + Math.abs(leg), 0);
      const legText = `v(t) = ${poly(velocity, "t")} = ${sign < 0 ? MINUS : ""}t(t − ${fmt(r1)})(t − ${fmt(r2)}) changes sign at t = ${fmt(r1)} and t = ${fmt(r2)}. Integrating v on [0, ${fmt(r1)}], [${fmt(r1)}, ${fmt(r2)}] and [${fmt(r2)}, ${fmt(end)}] gives ${legs.map(show).join(", ")}.`;
      return params.ask === "distance"
        ? done(
            distance,
            "",
            `${legText} Distance adds their absolute values: ${legs.map((leg) => show(Math.abs(leg))).join(" + ")} = ${show(distance)}.`,
          )
        : done(
            displacement,
            "",
            `${legText} Displacement is their plain sum, ${show(displacement)}, which is also just ∫₀${sup(end)} v(t) dt.`,
          );
    }
    case "implicit": {
      const { x0, y0 } = params;
      if (params.mode === "slope") {
        const { a } = params;
        const top = a * y0 - 3 * x0 * x0;
        const bottom = 3 * y0 * y0 - a * x0;
        const answer = top / bottom;
        return done(
          answer,
          "",
          `Differentiate both sides: 3x² + 3y²·y′ = ${fmt(a)}y + ${fmt(a)}x·y′, so y′ = (${fmt(a)}y − 3x²) / (3y² − ${fmt(a)}x). At (${fmt(x0)}, ${fmt(y0)}) that is ${paren(top)} / ${paren(bottom)} = ${show(answer)}.`,
        );
      }
      const { b } = params;
      const c = x0 * x0 + b * y0 * y0;
      const slope = -x0 / (b * y0);
      const answer = -c / (b * b * y0 ** 3);
      return done(
        answer,
        "",
        `2x + ${fmt(2 * b)}y·y′ = 0 gives y′ = −x / (${fmt(b)}y) = ${show(slope)} at the point. Differentiate again: y″ = −(${fmt(b)}y − ${fmt(b)}x·y′) / (${fmt(b)}y)² = −(${fmt(b)}y² + x²) / (${fmt(b * b)}y³) = −${fmt(c)} / (${fmt(b * b)}y³), since ${fmt(b)}y² + x² = ${fmt(c)} on the curve. At y = ${fmt(y0)}: ${show(answer)}.`,
      );
    }
    case "series": {
      switch (params.form) {
        case "xe": {
          const { p, q, n } = params;
          const coefficient = q ** (n - p) / factorial(n - p);
          const answer = factorial(n) * coefficient;
          return done(
            answer,
            "",
            `${power("x", p)}·${expo(q)} = ${power("x", p)} Σ (${terms([[q, "x"]])})ʲ / j!, so the coefficient of x${sup(n)} is ${paren(q)}${sup(n - p)} / ${fmt(n - p)}! = ${show(coefficient)}. A Maclaurin coefficient is f⁽ⁿ⁾(0) / n!, so f${sup(`(${n})`)}(0) = ${fmt(n)}! × ${show(coefficient)} = ${show(answer)}.`,
          );
        }
        case "cos": {
          const { q, k } = params;
          const n = 4 * k;
          const coefficient = ((-1) ** k * q ** (2 * k)) / factorial(2 * k);
          const answer = factorial(n) * coefficient;
          return done(
            answer,
            "",
            `cos(${fmt(q)}x²) = Σ (−1)ʲ (${fmt(q)}x²)${sup("2j")} / (2j)!, so the coefficient of x${sup(n)} is (−1)${sup(k)}·${fmt(q)}${sup(2 * k)} / ${fmt(2 * k)}! = ${show(coefficient)}. Then f${sup(`(${n})`)}(0) = ${fmt(n)}! × ${show(coefficient)} = ${show(answer)}.`,
          );
        }
        case "nrn": {
          const { p, q } = params;
          const r = p / q;
          const answer = r / (1 - r) ** 2;
          return done(
            answer,
            "",
            `Differentiate the geometric series Σ xⁿ = 1 / (1 − x) to get Σ n·xⁿ⁻¹ = 1 / (1 − x)², then multiply by x: Σ n·xⁿ = x / (1 − x)². At x = ${fmt(p)}/${fmt(q)} that is (${fmt(p)}/${fmt(q)}) / (${fmt(q - p)}/${fmt(q)})² = ${show(answer)}.`,
          );
        }
        case "telescope": {
          const { k } = params;
          let harmonic = 0;
          for (let i = 1; i <= k; i++) harmonic += 1 / i;
          const answer = harmonic / k;
          return done(
            answer,
            "",
            `1 / (n(n + ${fmt(k)})) = (1/${fmt(k)}) (1/n − 1/(n + ${fmt(k)})). The sum telescopes: every 1/(n + ${fmt(k)}) cancels a later 1/n, leaving the first ${fmt(k)} terms, so the sum is (1/${fmt(k)}) (${Array.from({ length: k }, (_, i) => `1/${i + 1}`).join(" + ")}) = ${show(answer)}.`,
          );
        }
      }
      break;
    }
    case "polar": {
      if (params.form === "limacon") {
        const { a, b } = params;
        const answer = a * a + (b * b) / 2;
        return done(
          answer,
          "π",
          `A = ½∫₀${sup("2π")} (${fmt(a)} + ${terms([[b, "cos θ"]])})² dθ = ½∫ (${fmt(a * a)} + ${terms([[2 * a * b, "cos θ"]])} + ${terms([[b * b, "cos²θ"]])}) dθ. Over a full turn cos θ integrates to 0 and cos²θ to π, so A = ½(${fmt(2 * a * a)}π + ${terms([[b * b, "π"]])}) = ${show(answer)}π.`,
        );
      }
      const { a, k } = params;
      const answer = (a * a) / (4 * k);
      return done(
        answer,
        "π",
        `One petal runs from θ = −π/${fmt(2 * k)} to π/${fmt(2 * k)}, where cos(${fmt(k)}θ) ≥ 0. A = ½∫ ${fmt(a * a)}cos²(${fmt(k)}θ) dθ = ${fmt(a * a)}/2 × (half the width, π/${fmt(2 * k)}) = ${show(answer)}π.`,
      );
    }
    case "euler": {
      const { p, q, r, h, steps } = params;
      let x = params.x0;
      let y = params.y0;
      const lines: string[] = [];
      for (let i = 0; i < steps; i++) {
        const slope = p * x + q * y + r * x * y;
        const next = y + h * slope;
        lines.push(
          `at (${fmt(x)}, ${fmt(y)}) the slope is ${fmt(slope)}, so y(${fmt(x + h)}) ≈ ${fmt(y)} + ${fmt(h)} × ${paren(slope)} = ${fmt(next)}`,
        );
        x += h;
        y = next;
      }
      return done(
        y,
        "",
        `Each step adds h × (slope at the current point): ${lines.join("; ")}.`,
      );
    }
    case "optimize": {
      const { w, l } = params;
      const cut = bestCut(w, l);
      const volume = cut * (w - 2 * cut) * (l - 2 * cut);
      const derivative = [w * l, -4 * (w + l), 12];
      const working = `V(x) = x(${fmt(w)} − 2x)(${fmt(l)} − 2x) = ${poly([0, w * l, -2 * (w + l), 4])}, so V′(x) = ${poly(derivative)}. The quadratic formula gives x = (${fmt(w + l)} ± √${fmt(w * w - w * l + l * l)}) / 6; only the smaller root, x = ${show(cut)}, leaves a positive width, and V′ changes from + to − there.`;
      return params.ask === "cut"
        ? done(cut, "", working)
        : done(
            volume,
            "",
            `${working} V(${show(cut)}) = ${show(cut)} × ${show(w - 2 * cut)} × ${show(l - 2 * cut)} = ${show(volume)}.`,
          );
    }
    case "limit": {
      switch (params.form) {
        case "expo": {
          const { a } = params;
          const answer = (a * a) / 2;
          return done(
            answer,
            "",
            `0/0, so L'Hôpital: (${terms([[a, expo(a)], [-a, ""]])}) / (2x), still 0/0; again: ${terms([[a * a, expo(a)]])} / 2 → ${show(answer)}. The series ${expo(a)} = ${terms([[1, ""], [a, "x"], [a * a, "x²/2"]])} + … says the same.`,
          );
        }
        case "tan": {
          const { a } = params;
          const answer = a ** 3 / 3;
          return done(
            answer,
            "",
            `tan u = u + u³/3 + …, so tan(${fmt(a)}x) − ${fmt(a)}x = (${fmt(a)}x)³/3 + … and the limit is ${fmt(a ** 3)}/3 = ${show(answer)}. (L'Hôpital three times gets there too.)`,
          );
        }
        case "cos": {
          const { a, b } = params;
          const answer = (a * a) / (2 * b);
          return done(
            answer,
            "",
            `1 − cos(${fmt(a)}x) ≈ ${fmt(a * a)}x²/2 and x·sin(${fmt(b)}x) ≈ ${fmt(b)}x², so the ratio tends to ${fmt(a * a)} / ${fmt(2 * b)} = ${show(answer)}.`,
          );
        }
        case "power": {
          const { a, b } = params;
          const answer = Math.exp(a * b);
          return done(
            answer,
            "",
            `Take logs: ${fmt(b)}x·ln(1 + ${fmt(a)}/x) = ${fmt(b)}·ln(1 + ${fmt(a)}/x) / (1/x) → ${fmt(b)} × ${fmt(a)} by L'Hôpital, so the limit is e${sup(a * b)} ≈ ${fmt(answer)}.`,
          );
        }
      }
      break;
    }
    case "table": {
      const { f, df, g, dg, a } = params;
      const at = (values: readonly number[], x: number) => values[x - 1];
      switch (params.mode) {
        case "chain": {
          const inner = at(g, a);
          const answer = at(df, inner) * at(dg, a);
          return done(
            answer,
            "",
            `h′(x) = f′(g(x))·g′(x). g(${fmt(a)}) = ${fmt(inner)}, f′(${fmt(inner)}) = ${fmt(at(df, inner))} and g′(${fmt(a)}) = ${fmt(at(dg, a))}, so h′(${fmt(a)}) = ${fmt(at(df, inner))} × ${paren(at(dg, a))} = ${show(answer)}.`,
          );
        }
        case "quotient": {
          const answer =
            (at(df, a) * at(g, a) - at(f, a) * at(dg, a)) / at(g, a) ** 2;
          return done(
            answer,
            "",
            `k′ = (f′g − fg′) / g². At x = ${fmt(a)}: (${fmt(at(df, a))} × ${fmt(at(g, a))} − ${paren(at(f, a))} × ${paren(at(dg, a))}) / ${fmt(at(g, a))}² = ${show(answer)}.`,
          );
        }
        case "inverse": {
          const answer = 1 / at(df, a);
          return done(
            answer,
            "",
            `f(${fmt(a)}) = ${fmt(at(f, a))}, so f⁻¹(${fmt(at(f, a))}) = ${fmt(a)}, and (f⁻¹)′(${fmt(at(f, a))}) = 1 / f′(${fmt(a)}) = 1/${fmt(at(df, a))} = ${show(answer)}.`,
          );
        }
      }
      break;
    }
    case "integral": {
      switch (params.form) {
        case "parts": {
          const { a } = params;
          const answer = ((a - 1) * Math.exp(a) + 1) / (a * a);
          return done(
            answer,
            "",
            `Parts with u = x, dv = ${expo(a)} dx: [${over(`x·${expo(a)}`, a)}]₀¹ − ∫₀¹ ${over(expo(a), a)} dx = ${over(power("e", a), a)} − ${over(`(${power("e", a)} − 1)`, a * a)} = ${over(`(${terms([[a - 1, power("e", a)], [1, ""]])})`, a * a)} ≈ ${fmt(answer)}.`,
          );
        }
        case "fractions": {
          const { p, q } = params;
          const answer = Math.log((q * (p + 1)) / (p * (q + 1))) / (q - p);
          return done(
            answer,
            "",
            `1/((x + ${fmt(p)})(x + ${fmt(q)})) = (1/${fmt(q - p)}) (1/(x + ${fmt(p)}) − 1/(x + ${fmt(q)})). Integrating from 0 to 1: (1/${fmt(q - p)}) [ln(x + ${fmt(p)}) − ln(x + ${fmt(q)})]₀¹ = (1/${fmt(q - p)}) ln(${fmt(q * (p + 1))}/${fmt(p * (q + 1))}) ≈ ${fmt(answer)}.`,
          );
        }
        case "usub": {
          const { p, q } = params;
          const r = Math.hypot(p, q);
          const answer = (r ** 3 - p ** 3) / 3;
          return done(
            answer,
            "",
            `u = x² + ${fmt(p * p)}, du = 2x dx: ∫₀${sup(q)} x√(x² + ${fmt(p * p)}) dx = ½∫ √u du = [u^(3/2)/3] from u = ${fmt(p * p)} to ${fmt(r * r)} = (${fmt(r)}³ − ${fmt(p)}³)/3 = (${fmt(r ** 3)} − ${fmt(p ** 3)})/3 = ${show(answer)}.`,
          );
        }
        case "log": {
          const { n } = params;
          const answer = (n * Math.exp(n + 1) + 1) / (n + 1) ** 2;
          return done(
            answer,
            "",
            `Parts with u = ln x, dv = ${power("x", n)} dx: [x${sup(n + 1)} ln x/${fmt(n + 1)}]₁ᵉ − ∫₁ᵉ ${power("x", n)}/${fmt(n + 1)} dx = e${sup(n + 1)}/${fmt(n + 1)} − (e${sup(n + 1)} − 1)/${fmt((n + 1) ** 2)} = (${terms([[n, `e${sup(n + 1)}`], [1, ""]])})/${fmt((n + 1) ** 2)} ≈ ${fmt(answer)}.`,
          );
        }
      }
      break;
    }
    case "parametric": {
      const { p, q, r, t0 } = params;
      const dx = 3 * t0 * t0 + p;
      const dy = 2 * q * t0 + r;
      const intro = `dx/dt = ${poly([p, 0, 3], "t")} = ${fmt(dx)} and dy/dt = ${poly([r, 2 * q], "t")} = ${fmt(dy)} at t = ${fmt(t0)}.`;
      switch (params.ask) {
        case "slope":
          return done(
            dy / dx,
            "",
            `${intro} dy/dx = (dy/dt) / (dx/dt) = ${paren(dy)} / ${paren(dx)} = ${show(dy / dx)}.`,
          );
        case "concavity": {
          // d/dt of dy/dx by the quotient rule, over dx/dt again.
          const numerator = 2 * q * dx - dy * 6 * t0;
          const answer = numerator / dx ** 3;
          return done(
            answer,
            "",
            `${intro} dy/dx = (${poly([r, 2 * q], "t")}) / (${poly([p, 0, 3], "t")}); d²y/dx² = [d/dt (dy/dx)] / (dx/dt) = [${fmt(2 * q)} × ${paren(dx)} − ${paren(dy)} × ${fmt(6 * t0)}] / ${paren(dx)}² ÷ ${paren(dx)} = ${fmt(numerator)} / ${fmt(dx ** 3)} = ${show(answer)}.`,
          );
        }
        case "speed": {
          const answer = Math.hypot(dx, dy);
          return done(
            answer,
            "",
            `${intro} Speed is √((dx/dt)² + (dy/dt)²) = √(${fmt(dx * dx)} + ${fmt(dy * dy)}) = √${fmt(dx * dx + dy * dy)} ≈ ${fmt(answer)}.`,
          );
        }
      }
      break;
    }
    case "related": {
      if (params.mode === "ladder") {
        const { x, y, u } = params;
        const answer = (u * x) / y;
        return done(
          answer,
          "",
          `x² + y² = ${fmt(x * x + y * y)}, so 2x·x′ + 2y·y′ = 0 and y′ = −x·x′ / y. With x = ${fmt(x)}, y = ${fmt(y)} and x′ = ${fmt(u)}: y′ = −${fmt(u * x)} / ${fmt(y)} = ${show(-answer)}, so the top slides down at ${show(answer)} m/s.`,
        );
      }
      const { d, east, north, t } = params;
      const gapX = d - east * t;
      const gapY = north * t;
      const s = Math.hypot(gapX, gapY);
      const answer = (-east * gapX + north * gapY) / s;
      return done(
        answer,
        "",
        `After ${fmt(t)} h the east–west gap is ${fmt(d)} − ${fmt(east)} × ${fmt(t)} = ${fmt(gapX)} km, shrinking at ${fmt(east)} km/h, and the north–south gap is ${fmt(gapY)} km, growing at ${fmt(north)} km/h. s² = x² + y² gives s·s′ = x·x′ + y·y′, and s = √(${fmt(gapX * gapX)} + ${fmt(gapY * gapY)}) = ${fmt(s)}, so s′ = (${fmt(gapX)} × (−${fmt(east)}) + ${fmt(gapY)} × ${fmt(north)}) / ${fmt(s)} = ${show(answer)} km/h.`,
      );
    }
  }
  throw new Error("unreachable puzzle");
}

export function isCorrect(params: PuzzleParams, guess: number) {
  const { answer, tolerance } = solve(params);
  return Number.isFinite(guess) && Math.abs(guess - answer) <= tolerance;
}
